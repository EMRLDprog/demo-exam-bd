import { Client } from 'pg';

export default async () => {
  const client = new Client({
    user: 'postgres',
    password: 'jdkhkjh56fgjkhui3eyjh',
    host: 'localhost',
    port: '5433',
    database: 'family_budget',
  });

  await client.connect();
  return client;
};