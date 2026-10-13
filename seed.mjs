// Demo-data seeder (T-21): 40 books, 10 members, 15 loans, 3 of them overdue.
// Everything is created through the API. The ONLY exception is backdating 3
// loans: the contract sets loaned_at=now server-side, so overdue demo data
// cannot exist through the API on day one. Two UPDATEs move loaned_at/due_at
// back; nothing else is touched by SQL.
import pg from 'pg';

const API = process.env.API_URL ?? 'http://localhost:8000/api/v1';
const ADMIN = { username: process.env.ADMIN_USERNAME ?? 'admin', password: process.env.ADMIN_PASSWORD };
if (!ADMIN.password) throw new Error('Set ADMIN_PASSWORD in the environment');

async function req(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const login = async () => (await req('/auth/login', { method: 'POST', body: ADMIN })).access_token;

const TITLES = ['Cien años de soledad', 'Ficciones', 'Rayuela', 'La ciudad y los perros', 'El túnel',
  'Cosmos', 'Breve historia del tiempo', 'El gen egoísta', 'Clean Code', 'Design Patterns',
  'Don Quijote', 'La Odisea', 'Crimen y castigo', '1984', 'El principito'];
const AUTHORS = ['García Márquez', 'Borges', 'Cortázar', 'Vargas Llosa', 'Sabato',
  'Sagan', 'Hawking', 'Dawkins', 'Martin', 'Gamma', 'Cervantes', 'Homero', 'Dostoievski', 'Orwell', 'Saint-Exupéry'];

const token = await login();
const cats = await req('/categories', { token });
console.log(`categories: ${cats.length}`);

// 40 books, 3 copies each
const books = [];
for (let i = 0; i < 40; i++) {
  const b = await req('/books', { token, method: 'POST', body: {
    title: `${TITLES[i % TITLES.length]} ${(Math.floor(i / TITLES.length) + 1)}`,
    author: AUTHORS[i % AUTHORS.length],
    isbn: `978${String(100000000 + i).padStart(10, '0')}`.slice(0, 13),
    category_id: cats[i % cats.length].id,
    total_copies: 3,
  }});
  books.push(b);
}
console.log(`books: ${books.length}`);

// 10 members
const members = [];
for (let i = 1; i <= 10; i++) {
  members.push(await req('/members', { token, method: 'POST', body: {
    full_name: `Socio Demo ${i}`, document_number: `DEMO-${String(i).padStart(4, '0')}`,
  }}));
}
console.log(`members: ${members.length}`);

// 15 loans honoring the 3-open-books cap per member
const loans = [];
const open = new Map(members.map((m) => [m.id, 0]));
let bi = 0, mi = 0, made = 0;
while (made < 15) {
  const member = members[mi++ % members.length];
  const cur = open.get(member.id);
  if (cur >= 3) continue;
  const n = (made % 3 === 2 && cur <= 1) ? 2 : 1;
  const items = [];
  for (let k = 0; k < n; k++) items.push({ book_id: books[bi++ % books.length].id });
  loans.push(await req('/loans', { token, method: 'POST', body: { member_id: member.id, items } }));
  open.set(member.id, cur + n);
  made++;
}
console.log(`loans: ${loans.length}`);

// Backdate exactly 3 lines into overdue (documented exception, see header)
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://library:library@localhost:5432/library' });
await db.connect();
for (const loan of loans.slice(0, 3)) {
  await db.query(`UPDATE library.loan SET loaned_at = NOW() - INTERVAL '20 days' WHERE id = $1`, [loan.id]);
}
await db.query(`UPDATE library.loan_item SET due_at = NOW() - INTERVAL '6 days' WHERE loan_id = ANY($1)`, [loans.slice(0, 2).map((l) => l.id)]);
await db.query(`UPDATE library.loan_item SET due_at = NOW() - INTERVAL '6 days' WHERE id = $1`, [loans[2].items[0].id]);
await db.end();
console.log('backdated 3 loans into overdue');

// Evidence
const overdue = await req('/loans/overdue', { token });
const report = await req('/reports/most-borrowed?from=2020-01-01&to=2030-12-31', { token });
console.log(`overdue lines: ${overdue.items.length}, report rows: ${report.rows.length}`);
if (overdue.items.length !== 3 || report.rows.length === 0) throw new Error('T-21 evidence failed');
console.log('T-21 OK');
