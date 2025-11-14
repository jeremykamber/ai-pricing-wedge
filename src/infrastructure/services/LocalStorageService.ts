import { DatabaseServicePort } from '../../domain/ports/DatabaseServicePort'

export class LocalStorageService implements DatabaseServicePort {
  async insert(table: string, data: any): Promise<void> {
    const items = JSON.parse(localStorage.getItem(table) || '[]')
    items.push(data)
    localStorage.setItem(table, JSON.stringify(items))
  }
  async update(table: string, id: string, data: any): Promise<void> {
    let items = JSON.parse(localStorage.getItem(table) || '[]')
    items = items.map((item: any) => item.id === id ? data : item)
    localStorage.setItem(table, JSON.stringify(items))
  }
  async find(table: string, query: any): Promise<any> {
    const items = JSON.parse(localStorage.getItem(table) || '[]')
    if (query.email) {
      return items.find((item: any) => item.email === query.email) || null
    }
    if (query.id) {
      return items.find((item: any) => item.id === query.id) || null
    }
    return null
  }
  async delete(table: string, id: string): Promise<void> {
    let items = JSON.parse(localStorage.getItem(table) || '[]')
    items = items.filter((item: any) => item.id !== id)
    localStorage.setItem(table, JSON.stringify(items))
  }
}
