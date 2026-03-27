
import { Prize } from '../types';

const DB_NAME = 'CraneStockDB';
const STORE_NAME = 'prizes';
const DB_VERSION = 1;

export class StorageService {
  private static openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  static async savePrizes(prizes: Prize[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // 既存のデータをクリア（古い 'current_inventory' キーも含む）
        store.clear();
        
        // 各景品を個別のレコードとして保存
        prizes.forEach(prize => {
          try {
            store.put(prize, prize.id);
          } catch (e) {
            console.error(`Failed to put prize ${prize.id}:`, e);
            throw e;
          }
        });

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  }

  static async loadPrizes(): Promise<Prize[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        
        // まず、レガシーな 'current_inventory' キーがあるか確認
        const legacyRequest = store.get('current_inventory');
        
        legacyRequest.onsuccess = () => {
          if (legacyRequest.result && Array.isArray(legacyRequest.result)) {
            // レガシーデータが見つかった場合
            db.close();
            resolve(legacyRequest.result);
          } else {
            // 個別レコードをすべて取得
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
              db.close();
              resolve(getAllRequest.result || []);
            };
            getAllRequest.onerror = () => {
              db.close();
              reject(getAllRequest.error);
            };
          }
        };
        
        legacyRequest.onerror = () => {
          db.close();
          reject(legacyRequest.error);
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  }

  // localStorageからの移行用
  static getLocalStorageData(): Prize[] | null {
    try {
      const data = localStorage.getItem('crane-game-prizes');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  static clearLocalStorage(): void {
    localStorage.removeItem('crane-game-prizes');
  }
}
