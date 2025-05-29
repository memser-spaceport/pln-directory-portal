import { API_ROUTE } from '../utils/constants';
import { getToken } from '../utils/auth';

export interface MasterDataItem {
  uid: string;
  title: string;
  description?: string;
  definition?: string;
  industryCategoryUid?: string;
  parentUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMasterDataItem {
  title: string;
  description?: string;
  definition?: string;
  industryCategoryUid?: string;
  parentUid?: string;
}

export interface UpdateMasterDataItem {
  title?: string;
  description?: string;
  definition?: string;
  industryCategoryUid?: string;
  parentUid?: string;
}

export type MasterDataType = 'industry-tags' | 'skills' | 'membership-sources' | 'technologies' | 'focus-areas';

class MasterDataService {
  private getHeaders() {
    const token = getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  async getAll(type: MasterDataType): Promise<MasterDataItem[]> {
    const response = await fetch(`${API_ROUTE.MASTER_DATA}/${type}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${type}`);
    }

    return response.json();
  }

  async getById(type: MasterDataType, uid: string): Promise<MasterDataItem> {
    const response = await fetch(`${API_ROUTE.MASTER_DATA}/${type}/${uid}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${type} with uid ${uid}`);
    }

    return response.json();
  }

  async create(type: MasterDataType, data: CreateMasterDataItem): Promise<MasterDataItem> {
    const response = await fetch(`${API_ROUTE.MASTER_DATA}/${type}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create ${type}`);
    }

    return response.json();
  }

  async update(type: MasterDataType, uid: string, data: UpdateMasterDataItem): Promise<MasterDataItem> {
    const response = await fetch(`${API_ROUTE.MASTER_DATA}/${type}/${uid}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to update ${type} with uid ${uid}`);
    }

    return response.json();
  }

  async delete(type: MasterDataType, uid: string): Promise<void> {
    const response = await fetch(`${API_ROUTE.MASTER_DATA}/${type}/${uid}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete ${type} with uid ${uid}`);
    }
  }
}

export const masterDataService = new MasterDataService();