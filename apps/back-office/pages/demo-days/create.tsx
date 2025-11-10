import React, { useState } from 'react';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { CreateDemoDayDto } from '../../screens/demo-days/types/demo-day';

const CreateDemoDayPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CreateDemoDayDto>({
    title: '',
    description: '',
    shortDescription: '',
    startDate: '',
    status: 'UPCOMING',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;

    setIsSubmitting(true);
    try {
      const config = {
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      };

      const payload = {
        ...formData,
        startDate: new Date(formData.startDate).toISOString(),
      };

      await api.post(API_ROUTE.ADMIN_DEMO_DAYS, payload, config);
      router.push('/demo-days');
    } catch (error) {
      console.error('Error creating demo day:', error);
      alert('Failed to create demo day. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <ApprovalLayout>
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-6">
          <button onClick={() => router.back()} className="mb-4 text-blue-600 hover:text-blue-800">
            ← Back to Demo Days
          </button>
          <h1 className="text-3xl font-semibold text-gray-900">Create New Demo Day</h1>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="mb-2 block text-sm font-medium text-gray-700">
                Title *
              </label>
              <input
                type="text"
                id="title"
                name="title"
                required
                value={formData.title}
                onChange={handleInputChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter demo day title"
              />
            </div>

            <div>
              <label htmlFor="shortDescription" className="mb-2 block text-sm font-medium text-gray-700">
                Short Description
              </label>
              <textarea
                id="shortDescription"
                name="shortDescription"
                value={formData.shortDescription}
                onChange={handleInputChange}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter a brief description"
              />
            </div>

            <div>
              <label htmlFor="description" className="mb-2 block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter demo day description"
              />
            </div>

            <div>
              <label htmlFor="startDate" className="mb-2 block text-sm font-medium text-gray-700">
                Start Date *
              </label>
              <input
                type="datetime-local"
                id="startDate"
                name="startDate"
                required
                value={formData.startDate}
                onChange={handleInputChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="status" className="mb-2 block text-sm font-medium text-gray-700">
                Status *
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="UPCOMING">Upcoming</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Demo Day'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default CreateDemoDayPage;
