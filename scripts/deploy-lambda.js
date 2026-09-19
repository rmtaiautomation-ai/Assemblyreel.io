require('dotenv').config({ path: '.env.local' });
const { execSync } = require('child_process');

console.log("Deploying Remotion Lambda with increased timeout (900s) and max free-tier memory (3008MB)...");

try {
  execSync('npx remotion lambda functions deploy --memory=3008 --disk=3008 --timeout=900', { 
    stdio: 'inherit',
    env: { ...process.env }
  });
  console.log("\n✅ Deployment successful!");
  console.log("👆 Remember to copy the NEW function name printed above and paste it into your .env.local file as REMOTION_FUNCTION_NAME.");
} catch (e) {
  console.error("Deployment failed.", e.message);
}
