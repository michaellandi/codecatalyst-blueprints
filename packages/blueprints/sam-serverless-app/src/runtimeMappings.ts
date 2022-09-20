import { java11, python36, nodejs14 } from './templateContents';
import { FileTemplateContext, RuntimeMapping } from './models';
import path from 'path';
import { StaticAsset, SubstitionAsset } from '@caws-blueprint-component/caws-source-repositories';

export const runtimeMappings: Map<string, RuntimeMapping> = new Map([
  [
    'Java 11 Maven',
    {
      runtime: 'java11',
      codeUri: 'HelloWorldFunction',
      srcCodePath: 'HelloWorldFunction/src/main',
      testPath: 'HelloWorldFunction/src/test',
      handler: 'helloworld.App::handleRequest',
      templateProps: java11,
      cacheDir: 'java11maven',
      gitSrcPath: 'cookiecutter-aws-sam-hello-java-maven',
      dependenciesFilePath: 'pom.xml',
      installInstructions:
        'Install [Python 3](https://www.python.org/downloads/)\n * Install [Java 11](https://docs.aws.amazon.com/corretto/latest/corretto-11-ug/downloads-list.html) and [Maven](https://maven.apache.org/download.cgi)',
      stepsToRunUnitTests: [],
      filesToCreate: [],
      filesToOverride: [],
      filesToChangePermissionsFor: [],
    },
  ],
  [
    'Java 11 Gradle',
    {
      runtime: 'java11',
      codeUri: 'HelloWorldFunction',
      srcCodePath: 'HelloWorldFunction/src/main',
      testPath: 'HelloWorldFunction/src/test',
      handler: 'helloworld.App::handleRequest',
      templateProps: java11,
      cacheDir: 'java11gradle',
      gitSrcPath: 'cookiecutter-aws-sam-hello-java-gradle',
      dependenciesFilePath: 'build.gradle',
      installInstructions:
        'Install [Python 3](https://www.python.org/downloads/)\n * Install [Java 11](https://docs.aws.amazon.com/corretto/latest/corretto-11-ug/downloads-list.html) and [Gradle](https://gradle.org/install/)',
      stepsToRunUnitTests: ['. ./.aws/scripts/run-tests.sh'],
      filesToCreate: [
        {
          resolvePath(context: FileTemplateContext) {
            return path.join(context.repositoryRelativePath, '.aws', 'scripts', 'run-tests.sh');
          },
          resolveContent(context: FileTemplateContext): string {
            return new SubstitionAsset('gradle/run-tests.sh').subsitite({ lambdaFunctionName: context.lambdaFunctionName });
          },
        },
      ],
      filesToOverride: [
        {
          resolvePath(context: FileTemplateContext) {
            return path.join(context.repositoryRelativePath, 'HelloWorldFunction', 'build.gradle');
          },
          // @ts-ignore
          resolveContent(context: FileTemplateContext): string {
            return new StaticAsset('gradle/build.gradle').toString();
          },
        },
      ],
      filesToChangePermissionsFor: [
        {
          resolvePath(context: FileTemplateContext) {
            return path.join(context.repositoryRelativePath, context.lambdaFunctionName, 'HelloWorldFunction', 'gradlew');
          },
          newPermissions: { executable: true },
        },
      ],
    },
  ],
  [
    'Node.js 14',
    {
      runtime: 'nodejs14.x',
      codeUri: 'hello-world/',
      srcCodePath: 'hello-world',
      testPath: 'hello-world/tests',
      handler: 'app.lambdaHandler',
      templateProps: nodejs14,
      cacheDir: 'nodejs14',
      gitSrcPath: 'cookiecutter-aws-sam-hello-nodejs',
      dependenciesFilePath: 'package.json',
      installInstructions:
        'Install [Python 3](https://www.python.org/downloads/)\n * Install [Node.js 14 and npm](https://nodejs.org/en/download/releases/)',
      stepsToRunUnitTests: ['. ./.aws/scripts/run-tests.sh'],
      filesToCreate: [
        {
          resolvePath(context: FileTemplateContext) {
            return path.join(context.repositoryRelativePath, '.aws', 'scripts', 'run-tests.sh');
          },
          resolveContent(context: FileTemplateContext): string {
            return new SubstitionAsset('nodejs/run-tests.sh').subsitite({ lambdaFunctionName: context.lambdaFunctionName });
          },
        },
      ],
      filesToOverride: [
        {
          resolvePath(context: FileTemplateContext) {
            return path.join(context.repositoryRelativePath, 'hello-world', 'package.json');
          },
          // @ts-ignore
          resolveContent(context: FileTemplateContext): string {
            return new StaticAsset('nodejs/package.json').toString();
          },
        },
      ],
      filesToChangePermissionsFor: [],
      autoDiscoveryOverride: {
        ReportNamePrefix: 'AutoDiscovered',
        IncludePaths: ['**/*'],
        ExcludePaths: ['.aws-sam/**/*'],
        Enabled: true,
        SuccessCriteria: {
          PassRate: 100,
          LineCoverage: 65,
          BranchCoverage: 50,
        },
      },
    },
  ],
  [
    'Python 3',
    {
      runtime: 'python3.6',
      codeUri: 'hello_world/',
      srcCodePath: 'hello_world',
      testPath: 'tests',
      handler: 'app.lambda_handler',
      templateProps: python36,
      cacheDir: 'python36',
      gitSrcPath: 'cookiecutter-aws-sam-hello-python',
      dependenciesFilePath: 'requirements.txt',
      installInstructions: 'Install [Python3.6](https://www.python.org/downloads/)',
      stepsToRunUnitTests: ['. ./.aws/scripts/bootstrap.sh', '. ./.aws/scripts/run-tests.sh'],
      filesToCreate: [
        {
          resolvePath(context: FileTemplateContext) {
            return path.join(context.repositoryRelativePath, 'requirements-dev.txt');
          },
          // @ts-ignore
          resolveContent(context: FileTemplateContext): string {
            return new StaticAsset('python/requirements-dev.txt').toString();
          },
        },
        {
          resolvePath(context: FileTemplateContext) {
            return path.join(context.repositoryRelativePath, '.aws', 'scripts', 'bootstrap.sh');
          },
          resolveContent(context: FileTemplateContext): string {
            return new SubstitionAsset('python/bootstrap.sh').subsitite({ lambdaFunctionName: context.lambdaFunctionName });
          },
        },
        {
          resolvePath(context: FileTemplateContext) {
            return path.join(context.repositoryRelativePath, '.aws', 'scripts', 'run-tests.sh');
          },
          resolveContent(context: FileTemplateContext): string {
            return new SubstitionAsset('python/run-tests.sh').subsitite({ lambdaFunctionName: context.lambdaFunctionName });
          },
        },
      ],
      filesToOverride: [],
      filesToChangePermissionsFor: [],
    },
  ],
]);
