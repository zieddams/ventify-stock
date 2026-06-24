const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildUpdatedGradleContent,
  resolveVersionMetadata,
  syncAndroidVersionFile,
} = require('../scripts/sync-android-version.cjs')

test('resolveVersionMetadata validates package and app config versions', () => {
  assert.deepEqual(
    resolveVersionMetadata(
      { version: '1.3.20' },
      { version: '1.3.20', android: { versionCode: 27 } }
    ),
    { versionName: '1.3.20', versionCode: 27 }
  )

  assert.throws(
    () => resolveVersionMetadata({ version: '' }, { version: '', android: { versionCode: 27 } }),
    /Missing app version/
  )

  assert.throws(
    () => resolveVersionMetadata({ version: '1.3.20' }, { version: '1.3.20', android: { versionCode: 0 } }),
    /positive integer/
  )
})

test('buildUpdatedGradleContent reports whether version markers changed', () => {
  const content = `
    defaultConfig {
        versionCode 25
        versionName "1.3.18"
    }
  `

  assert.deepEqual(
    buildUpdatedGradleContent(content, '1.3.20', 27),
    {
      changed: true,
      content: `
    defaultConfig {
        versionCode 27
        versionName "1.3.20"
    }
  `,
    }
  )

  const alreadySynced = `
    defaultConfig {
        versionCode 27
        versionName "1.3.20"
    }
  `

  assert.equal(buildUpdatedGradleContent(alreadySynced, '1.3.20', 27).changed, false)
})

test('syncAndroidVersionFile can update an in-memory file implementation', () => {
  let fileContent = `
    defaultConfig {
        versionCode 21
        versionName "1.1.0"
    }
  `

  const fsImpl = {
    existsSync(targetPath) {
      return targetPath === '/tmp/build.gradle'
    },
    readFileSync() {
      return fileContent
    },
    writeFileSync(targetPath, nextContent) {
      assert.equal(targetPath, '/tmp/build.gradle')
      fileContent = nextContent
    },
  }

  const result = syncAndroidVersionFile({
    fsImpl,
    targetPath: '/tmp/build.gradle',
    packageJson: { version: '1.3.20' },
    appConfig: { version: '1.3.20', android: { versionCode: 27 } },
  })

  assert.equal(result.changed, true)
  assert.match(result.message, /Updated android build.gradle to 1.3.20 \(27\)/)
  assert.match(fileContent, /versionCode 27/)
  assert.match(fileContent, /versionName "1.3.20"/)
})
