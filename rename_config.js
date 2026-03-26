const fs = require('fs');
const path = require('path');

const files = [
  'prisma/schema.prisma',
  'apps/core-api/src/modules/device/services/device-provisioning.service.ts',
  'apps/core-api/src/modules/admin/admin.service.ts',
  'apps/core-api/src/modules/device/services/device-provisioning.service.spec.ts',
  'apps/core-api/src/modules/admin/admin.controller.ts',
  'apps/core-api/src/modules/admin/dtos/request/create-device-model.dto.ts',
  'api/admin.http'
];

files.forEach(fileRel => {
  const file = path.join(__dirname, fileRel);
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/featuresConfig/g, 'config');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${fileRel}`);
  } else {
    console.log(`Missing ${fileRel}`);
  }
});
