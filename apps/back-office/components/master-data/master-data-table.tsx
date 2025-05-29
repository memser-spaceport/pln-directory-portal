import React, { useState, useEffect } from 'react';
import { MasterDataItem, MasterDataType, masterDataService } from '../../services/master-data.service';
import { MasterDataForm } from './master-data-form';

interface MasterDataTableProps {
  type: MasterDataType;
  title: string;
  fields: Array<{
    key: keyof MasterDataItem;
    label: string;
    type?: 'text' | 'textarea';
  }>;
}

export function MasterDataTable({ type, title, fields }: MasterDataTableProps) {
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null);

  useEffect(() => {
    loadItems();
  }, [type]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await masterDataService.getAll(type);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    setShowForm(true);
  };

  const handleEdit = (item: MasterDataItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleDelete = async (uid: string) => {
    if (!confirm('Are you sure you want to delete this item?')) {
      return;
    }

    try {
      await masterDataService.delete(type, uid);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  const handleFormSubmit = async () => {
    setShowForm(false);
    setEditingItem(null);
    await loadItems();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingItem(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <button
          onClick={handleCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          Add New
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <MasterDataForm
            type={type}
            fields={fields}
            item={editingItem}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
          />
        </div>
      )}

      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {fields.map((field) => (
                <th
                  key={field.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {field.label}
                </th>
              ))}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created At
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.uid} className="hover:bg-gray-50">
                {fields.map((field) => (
                  <td key={field.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {field.type === 'textarea' ? (
                      <div className="max-w-xs truncate" title={item[field.key] as string}>
                        {item[field.key] || '-'}
                      </div>
                    ) : (
                      item[field.key] || '-'
                    )}
                  </td>
                ))}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(item.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.uid)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500">No items found</div>
          </div>
        )}
      </div>
    </div>
  );
}