import React, { useState, useEffect } from 'react';
import { MasterDataItem, MasterDataType, CreateMasterDataItem, UpdateMasterDataItem, masterDataService } from '../../services/master-data.service';

interface MasterDataFormProps {
  type: MasterDataType;
  fields: Array<{
    key: keyof MasterDataItem;
    label: string;
    type?: 'text' | 'textarea';
    required?: boolean;
  }>;
  item?: MasterDataItem | null;
  onSubmit: () => void;
  onCancel: () => void;
}

export function MasterDataForm({ type, fields, item, onSubmit, onCancel }: MasterDataFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      const initialData: Record<string, string> = {};
      fields.forEach((field) => {
        initialData[field.key] = (item[field.key] as string) || '';
      });
      setFormData(initialData);
    } else {
      const initialData: Record<string, string> = {};
      fields.forEach((field) => {
        initialData[field.key] = '';
      });
      setFormData(initialData);
    }
  }, [item, fields]);

  const handleInputChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Filter out empty values for optional fields
      const cleanedData = Object.entries(formData).reduce((acc, [key, value]) => {
        if (value.trim() !== '') {
          acc[key] = value.trim();
        }
        return acc;
      }, {} as Record<string, string>);

      if (item) {
        // Update existing item
        await masterDataService.update(type, item.uid, cleanedData as UpdateMasterDataItem);
      } else {
        // Create new item
        await masterDataService.create(type, cleanedData as CreateMasterDataItem);
      }
      
      onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    return fields.every(field => {
      if (field.required !== false && field.key === 'title') {
        return formData[field.key]?.trim() !== '';
      }
      return true;
    });
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        {item ? 'Edit' : 'Create'} {type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </h3>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
              {field.required !== false && field.key === 'title' && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                value={formData[field.key] || ''}
                onChange={(e) => handleInputChange(field.key, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder={`Enter ${field.label.toLowerCase()}`}
              />
            ) : (
              <input
                type="text"
                value={formData[field.key] || ''}
                onChange={(e) => handleInputChange(field.key, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={`Enter ${field.label.toLowerCase()}`}
              />
            )}
          </div>
        ))}

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !isFormValid()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : (item ? 'Update' : 'Create')}
          </button>
        </div>
      </form>
    </div>
  );
}