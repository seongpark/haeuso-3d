'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

/* 개인용이라 Apple 개발자 인증서 없이 빌드한다(identity:null).
   그런데 Apple Silicon 은 서명이 아예 없는 바이너리를 실행하지 않으므로,
   패키징이 끝난 뒤 ad-hoc(자체) 서명을 붙여 준다. 배포용 공증과는 별개다. */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log(`  • ad-hoc 서명 완료  ${appPath}`);
};
