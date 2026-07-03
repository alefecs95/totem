import { Pool, QueryResult, QueryResultRow } from 'pg';

// Pool de conexões PostgreSQL compartilhado por toda a aplicação.
// Multi-tenant / multi-totem: o isolamento é feito por tenant_id/totem_id
// nas queries, não por conexão.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool PostgreSQL:', err);
});

// Helper para executar queries usando o pool.
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}
