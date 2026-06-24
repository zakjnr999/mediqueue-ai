#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { MediQueueInfraStack } from '../lib/mediqueue-infra-stack';

const app = new cdk.App();
new MediQueueInfraStack(app, 'MediQueueInfraStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
