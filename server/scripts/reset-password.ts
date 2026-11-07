// Operator recovery: `npm run reset-password -- <new password> [email]`.
import { config } from '../src/config/env.js';
import { openDatabase } from '../src/db/client.js';
import { hashPassword } from '../src/lib/crypto.js';

const [password, email = config.auth.adminEmail] = process.argv.slice(2);
if (!password || password.length < 10) {
  console.error('Usage: npm run reset-password -- <new password, at least 10 characters> [email]');
  process.exit(1);
}

const db = openDatabase(config.databasePath);
const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
if (!user) {
  console.error(`No operator account for ${email}.`);
  process.exit(1);
}
db.transaction(() => {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
})();
console.log(`Password updated for ${email}. All of that account's sessions were signed out.`);
db.close();
