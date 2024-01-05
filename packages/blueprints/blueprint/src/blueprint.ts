/* eslint-disable @typescript-eslint/no-empty-function */
import * as fs from 'fs';
import * as path from 'path';

import { Project } from 'projen';
import { BlueprintInstantiation, Context, ResynthesisPhase } from './context/context';
import { TraversalOptions, traverse } from './context/traverse';
import { createLifecyclePullRequest } from './pull-requests/create-lifecycle-pull-request';
import { ContextFile, createContextFile, destructurePath } from './resynthesis/context-file';
import { filepathSet } from './resynthesis/file-set';
import { StrategyLocations, deserializeStrategies, filterStrategies, merge } from './resynthesis/merge-strategies/deserialize-strategies';
import { FALLBACK_STRATEGY_ID, match } from './resynthesis/merge-strategies/match';
import { Strategy } from './resynthesis/merge-strategies/models';
import { Ownership } from './resynthesis/ownership';

export interface ParentOptions {
  outdir: string;
  parent?: Project;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Options extends ParentOptions {}

export class Blueprint extends Project {
  public readonly context: Context;
  protected strategies: StrategyLocations | undefined;
  /**
   * Set information used on the pull request generated by resynthesis
   */
  public resynthPullRequest: {
    title: string;
    description: string;
    originBranch: string;
    targetBranch?: string;
  };

  constructor(options: Options) {
    super({
      name: 'CodeCatalystBlueprint',
      ...options,
    });

    const OPTIONS_FILE = 'options.json';
    this.context = {
      rootDir: path.resolve(this.outdir),
      spaceName: process.env.CONTEXT_SPACENAME,
      environmentId: process.env.CONTEXT_ENVIRONMENTID,
      branchName: process.env.BRANCH_NAME,
      resynthesisPhase: (process.env.RESYNTH_PHASE || 'PROPOSED') as ResynthesisPhase,
      npmConfiguration: {
        token: process.env.NPM_CONFIG_TOKEN,
        registry: process.env.NPM_CONFIG_REGISTRY ?? '',
      },
      package: {
        name: process.env.PACKAGE_NAME,
        version: process.env.PACKAGE_VERSION,
      },
      project: {
        name: process.env.CONTEXT_PROJECTNAME,
        bundlepath: process.env.EXISTING_BUNDLE_ABS,
        options: getOptions(path.join(process.env.EXISTING_BUNDLE_ABS || '', OPTIONS_FILE)),
        blueprint: {
          instantiations: structureExistingBlueprints(process.env.INSTANTIATIONS_ABS),
        },
        src: {
          listRepositoryNames: (): string[] => {
            const repoBundlePath = path.join(this.context.project.bundlepath || '', 'src');
            if (this.context.project.bundlepath && fs.existsSync(repoBundlePath)) {
              return fs.readdirSync(repoBundlePath).filter(file => {
                const fileLocation = path.join(repoBundlePath, file);
                return fs.existsSync(fileLocation) && fs.statSync(fileLocation).isDirectory();
              });
            }
            return [];
          },
          findAll: (_options?: TraversalOptions) => traverse(this.context.project.bundlepath, _options),
        },
      },
    };

    for (const component of this.components) {
      component.synthesize = () => {};
    }

    // write the options to the bundle
    const optionsRecordPath = path.join(this.outdir, OPTIONS_FILE);
    fs.mkdirSync(path.dirname(optionsRecordPath), { recursive: true });
    fs.writeFileSync(optionsRecordPath, JSON.stringify(options, null, 2));

    this.resynthPullRequest = {
      originBranch: this.context.branchName || 'resynthesis-update',
      title: `chore(resynthesis): update [${this.context.package.name}@${this.context.package.version}]`,
      description: [
        'This is a pull request created from a resynthesis update.',
        '',
        `Blueprint: [${this.context.package.name}@${this.context.package.version}]`,
        '### New Options',
        '```',
        JSON.stringify(options, null, 2),
        '```',
      ].join('\n'),
    };
  }

  setResynthStrategies(bundlepath: string, strategies: Strategy[]) {
    if (!this.strategies) {
      this.strategies = {};
    }
    this.strategies[bundlepath] = strategies;
  }

  getResynthStrategies(bundlepath: string): Strategy[] {
    return (this.strategies || {})[bundlepath] || [];
  }

  resynth(ancestorBundle: string, existingBundle: string, proposedBundle: string) {
    ancestorBundle = path.resolve(ancestorBundle);
    existingBundle = path.resolve(existingBundle);
    proposedBundle = path.resolve(proposedBundle);

    //1. find the merge strategies from the exisiting codebase, deserialize and match against strategies in memory
    const overriddenStrategies: StrategyLocations = deserializeStrategies(existingBundle, this.strategies || {});
    const validStrategies = merge(this.strategies || {}, filterStrategies(overriddenStrategies, this.context.package));

    // used for pretty formatting
    let maxIdlength = 0;
    console.log('<<STRATEGY>> Last <<STRATEGY>> Wins:');
    console.log(`<<STRATEGY>> [SYS-FALLBACK] [${FALLBACK_STRATEGY_ID}] matches [*]`);
    for (const [ownershipFile, strategies] of Object.entries(validStrategies)) {
      for (const strategy of strategies) {
        console.log(
          structureStrategyReport(ownershipFile, strategy, {
            overriden: ownershipFile.includes(Ownership.DEFAULT_FILE_NAME),
          }),
        );
        maxIdlength = Math.max(strategy.identifier.length, maxIdlength);
      }
    }
    maxIdlength = Math.max(maxIdlength, FALLBACK_STRATEGY_ID.length);

    /**
     * copy all non-src file from proposedBundle into the resolved bundle
     * only src is merge constructed.
     */
    const supersetNonSourcePaths: string[] = filepathSet([proposedBundle], ['**/*', '!src/**']);
    for (const filepath of supersetNonSourcePaths) {
      const outputPath = path.join(this.outdir, filepath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const filecontent = fs.readFileSync(path.join(proposedBundle, filepath));
      fs.writeFileSync(outputPath, filecontent);
    }

    //2. construct the superset of files between [ancestorBundle, existingBundle, proposedBundle]/src
    // only consider files under the source code 'src'
    const supersetSourcePaths: string[] = filepathSet([ancestorBundle, existingBundle, proposedBundle], ['src/**']);
    supersetSourcePaths.forEach(sourcePath => {
      //3. for each file, match it with a merge strategy
      const strategy = match(sourcePath, validStrategies);
      const { resourcePrefix, subdirectory, filepath } = destructurePath(sourcePath, '');
      const repositoryTitle = subdirectory;

      const resolvedFile = strategy.strategy(
        createContextFile(ancestorBundle, resourcePrefix!, repositoryTitle!, filepath!),
        createContextFile(existingBundle, resourcePrefix!, repositoryTitle!, filepath!),
        createContextFile(proposedBundle, resourcePrefix!, repositoryTitle!, filepath!),
      );

      console.debug(structureMatchReport(maxIdlength, strategy, repositoryTitle!, filepath!));
      if (resolvedFile) {
        //4. write the result of the merge strategy to the outdir/src/repo/path
        this.write(resolvedFile);
      } else {
        console.debug('\t -> removed');
      }
    });

    // generate pull requests
    createLifecyclePullRequest(this.outdir, existingBundle, {
      originBranch: this.resynthPullRequest.originBranch,
      targetBranch: this.resynthPullRequest.targetBranch,
      pullRequest: {
        id: this.context.branchName || 'resynthesis-update',
        title: this.resynthPullRequest.title,
        description: this.resynthPullRequest.description,
      },
    });
  }

  write(file: ContextFile) {
    const outputPath = path.join(this.outdir, 'src', file.repositoryName!, file.path);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, file.buffer);
  }

  throwSynthesisError(error: BlueprintSynthesisError) {
    throw error;
  }
}

export enum BlueprintSynthesisErrorTypes {
  /**
   * Throw for generic synthesis error not defined in BlueprintSynthesisErrorTypes
   */
  BlueprintSynthesisError = 'BlueprintSynthesisError',
  /**
   * Throw when there is a conflict with a resource in synth
   * Ex: Folder with name X already exists, a workspace already exists for repository X
   */
  ConflictError = 'BlueprintSynthesisConflictError',
  /**
   * Throw when unable to find resource in synth
   * Ex: Git repository not found when cloning, unable to find image imported from the web
   */
  NotFoundError = 'BlueprintSynthesisNotFoundError',
  /**
   * Throw when resource fails validation in synth
   * Ex: Filename fails regex validation, X required if Y is not given
   */
  ValidationError = 'BlueprintSynthesisValidationError',
}

export class BlueprintSynthesisError extends Error {
  constructor(options: { message: string; type: BlueprintSynthesisErrorTypes }) {
    const { message, type } = options;
    super(message);
    this.name = type;
  }
}

function structureMatchReport(maxStrategyLength: number, strategy: Strategy, repository: string, filepath: string) {
  return `[${strategy.identifier}]${' '.repeat(maxStrategyLength - strategy.identifier.length)} [${repository}] [${filepath}] -> [${strategy.globs}]`;
}

function structureStrategyReport(
  ownershipFile: string,
  strategy: Strategy,
  options: {
    overriden: boolean;
  },
) {
  let overrideText = '';
  if (options.overriden) {
    overrideText = '[Overridden] ';
  }
  return `<<STRATEGY>> ${overrideText}[${ownershipFile}] [${strategy.identifier}] matches [${strategy.globs}]`;
}

function getOptions(location: string): any {
  try {
    return JSON.parse(fs.readFileSync(location).toString());
  } catch {
    return {};
  }
}

function structureExistingBlueprints(location: string | undefined): BlueprintInstantiation[] {
  if (!location) {
    console.warn('Instantiations location not specified');
    return [];
  }
  if (!fs.existsSync(location || '')) {
    console.warn('Could not find instantiations at ' + location);
    return [];
  }
  try {
    const result = JSON.parse(fs.readFileSync(location!).toString());
    const instantiations = (result as BlueprintInstantiation[]).map(instantiation => {
      return {
        ...instantiation,
        options: JSON.parse(instantiation.options),
      };
    });
    return instantiations;
  } catch (error) {
    console.error(error);
    console.error('Could not read instantiations at ' + location);
  }
  return [];
}
