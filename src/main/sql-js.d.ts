/** 当前 Repository 使用的 sql.js 接口；WASM 包本身不带类型声明。 */
declare module 'sql.js' {
  export type SqlValue = string | number | Uint8Array | null
  export interface Statement {
    bind(values: SqlValue[]): boolean
    step(): boolean
    getAsObject(): Record<string, SqlValue>
    free(): boolean
  }
  export interface Database {
    run(sql: string, values?: SqlValue[]): Database
    prepare(sql: string): Statement
    export(): Uint8Array
  }
  export default function initSqlJs(options?: {
    locateFile?: (file: string, prefix: string) => string
  }): Promise<{ Database: new (data?: Uint8Array) => Database }>
}
