import fs from 'fs'
import admin from 'firebase-admin'

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT || './serviceAccountKey.json'
if (!fs.existsSync(keyPath)) {
  console.error('Missing service account JSON at', keyPath)
  process.exit(1)
}
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

async function main() {
  const uid = process.argv[2]
  if (!uid) {
    console.error('Usage: npm run set:police <UID>')
    process.exit(1)
  }
  await admin.auth().setCustomUserClaims(uid, { role: 'police' })
  const u = await admin.auth().getUser(uid)
  console.log('Updated claims:', u.customClaims)
  console.log('User must sign out/in to refresh token.')
}

main().catch(e => { console.error(e); process.exit(1) })
