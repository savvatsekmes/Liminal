// electron-builder afterSign hook for unsigned macOS distribution.
//
// With `mac.identity: null`, electron-builder skips its signing pipeline,
// which leaves the .app bundle unsealed (`Sealed Resources=none`). On
// Apple Silicon, launching such a bundle fails with security error -67062
// because the kernel rejects the partial signature.
//
// We re-sign the bundle ad-hoc here. This produces a complete signed bundle
// (with sealed resources) that uses the "-" identity, which is sufficient
// for local distribution. End-users still see Gatekeeper's first-run warning
// because the signature has no Developer ID — that's expected.

const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing  app=${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
