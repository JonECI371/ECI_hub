# Building and deploying the test site from AWS (instead of from Claude's workspace)

Why: builds run in Claude's cloud workspace, which restarts every few hours and kills the build. The workspace is also a different type of machine from the ARM test server, so every build is emulated and takes about 25 minutes. AWS CodeBuild builds on a real ARM machine, so it should take roughly 6 to 10 minutes, and a workspace restart cannot stop it. Written 19 Nov 2026. The files `buildspec.yml` and `scripts/restart-test-server.sh` are written but NOT yet tested in AWS.

Do all of this in the AWS Console, **region Europe (Stockholm) eu-north-1**, signed in as an administrator (not the deployer user). Do the budget and anomaly alert tasks first if you have not. It takes about 30 minutes. A developer can do it with you.

## 1. Check the image repository
- ECR, Private repositories: `eci-hub` should already exist in Stockholm. Nothing to do.

## 2. Create the build project
- CodeBuild, Build projects, **Create build project**.
- Project name: `eci-hub-test-build`.
- Source: **GitHub**. Choose "Connect using OAuth" (or the GitHub App option), sign in to GitHub as the owner of the repository, and allow access. Repository: `JonECI371/ECI_hub`. Source version: the branch Claude pushes to (currently `main`).
- Environment: **Managed image**, Operating system **Amazon Linux**, Runtime **Standard**, Image **aws/codebuild/amazonlinux-aarch64-standard:3.0** (or the newest aarch64 standard image), Environment type **Arm container**.
- Compute: choose the **Large Arm** size (about 16 GB of memory). The Small size has 4 GB and a Next.js build may run out of memory. The console shows the price per build minute: for a build of 6 to 10 minutes I expect pennies, but check the figure it shows before you save.
- **Tick "Privileged"** (needed to run Docker).
- Service role: **New service role**, name `eci-hub-test-build-role`.
- Buildspec: **Use a buildspec file**, leave the name empty (it finds `buildspec.yml` in the repository).
- Logs: CloudWatch logs on (default).
- Create the project.

## 3. Give the build role the rights it needs
IAM, Roles, `eci-hub-test-build-role`, Add permissions, **Create inline policy**, JSON, name `eci-hub-test-build-extra`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    { "Effect": "Allow",
      "Action": ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"],
      "Resource": "arn:aws:ecr:eu-north-1:992868470990:repository/eci-hub" },
    { "Effect": "Allow", "Action": "ssm:SendCommand",
      "Resource": ["arn:aws:ec2:eu-north-1:992868470990:instance/i-0567b0e02843cb540", "arn:aws:ssm:eu-north-1::document/AWS-RunShellScript"] },
    { "Effect": "Allow", "Action": ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"], "Resource": "*" }
  ]
}
```
(The role also needs to read public images; `public.ecr.aws` needs no permission.)

## 4. Let Claude start builds and read the result
So Claude can deploy without you clicking: IAM, Users, `eci-hub-deployer`, Add permissions, Create inline policy, JSON, name `eci-hub-start-builds`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["codebuild:StartBuild", "codebuild:BatchGetBuilds", "codebuild:ListBuildsForProject"],
      "Resource": "arn:aws:codebuild:eu-north-1:992868470990:project/eci-hub-test-build" },
    { "Effect": "Allow", "Action": ["logs:GetLogEvents", "logs:FilterLogEvents"],
      "Resource": "arn:aws:logs:eu-north-1:992868470990:log-group:/aws/codebuild/eci-hub-test-build:*" }
  ]
}
```
This does not let the deployer user change anything else, and it cannot create or edit roles.

## 5. First test
- CodeBuild, `eci-hub-test-build`, **Start build**. Watch the logs: it builds two images, pushes them, then restarts the test server and prints four status codes (all should be 200).
- If it fails, copy the last 30 lines of the log to Claude. The most likely problems are Docker Hub limits (already avoided by using ECR Public), memory (choose the larger size) and a missing right in step 3.

## After that
Claude deploys with one command (`aws codebuild start-build --project-name eci-hub-test-build --source-version <commit>`), then reads the log. No more 25 minute emulated builds, and a workspace restart cannot kill one.

Alternative if you prefer GitHub: GitHub Actions with an Arm runner can do the same job, but private repositories may be billed for Arm minutes and it needs an AWS role that GitHub can assume. CodeBuild keeps everything in your AWS account and is what I recommend. For production later, the same build moves into a deployment pipeline for London.
