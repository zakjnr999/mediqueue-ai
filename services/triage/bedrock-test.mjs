import { runPocTests } from './tests/bedrock-poc.mjs';

runPocTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\nTest Runner Failed: ${err.message}`);
    process.exit(1);
  });
