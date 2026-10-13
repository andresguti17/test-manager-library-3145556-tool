# test-manager-library-3145556-tool

Demo-data seeder for *Manager Library* (T-21). Creates 40 books, 10 members
and 15 loans through the API, leaving 3 overdue lines and a populated report.

## Run

```powershell
npm install
$env:API_URL='http://localhost:8000/api/v1'
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD='...'
$env:DATABASE_URL='postgresql://library:library@localhost:5432/library'
npm run seed
```

Expected tail: `overdue lines: 3, report rows: 20` + `T-21 OK`.

## One documented exception

The contract sets `loaned_at = now` server-side, so overdue demo data cannot
exist through the API on day one. The seeder backdates 3 loan lines with two
`UPDATE`s (nothing else); every row is created through the API.
