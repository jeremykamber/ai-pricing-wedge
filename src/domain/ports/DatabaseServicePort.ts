export interface DatabaseServicePort {
  insert(table: string, data: any): Promise<void>
  update(table: string, id: string, data: any): Promise<void>
  find(table: string, query: any): Promise<any>
  delete(table: string, id: string): Promise<void>
}
