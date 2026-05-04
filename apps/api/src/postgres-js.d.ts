declare module 'postgres-js' {
  function postgres(url: string, options?: Record<string, unknown>): {
    query: <T = unknown>(query: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
    end: () => Promise<void>;
  };
  export = postgres;
}
