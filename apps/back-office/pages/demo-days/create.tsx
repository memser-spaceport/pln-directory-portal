import React, { useState, useEffect } from 'react';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { CreateDemoDayDto } from '../../screens/demo-days/types/demo-day';
import dynamic from 'next/dynamic';
import { useAuth } from '../../context/auth-context';
import { DEMO_DAY_HOSTS } from '@protocol-labs-network/contracts/constants';

const RichTextEditor = dynamic(() => import('../../components/common/rich-text-editor'), { ssr: false });

const CreateDemoDayPage = () => {
  const router = useRouter();
  const [authToken] = useCookie('plnadmin');
  const { isDirectoryAdmin, isLoading, user } = useAuth();

  // Redirect to log-in if not authenticated
  useEffect(() => {
    if (!authToken) {
      router.replace(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  // Redirect non-directory admins - they can't create demo days
  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugError, setSlugError] = useState<string>('');
  const [formData, setFormData] = useState<CreateDemoDayDto>({
    title: '',
    slugURL: '',
    description: '',
    shortDescription: '',
    startDate: '',
    endDate: '',
    host: '',
    status: 'UPCOMING',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;

    setIsSubmitting(true);
    setSlugError('');
    try {
      const config = {
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      };

      const payload = {
        ...formData,
        // Treat datetime-local input as UTC
        startDate: `${formData.startDate}:00.000Z`,
        endDate: `${formData.endDate}:00.000Z`,
      };

      await api.post(API_ROUTE.ADMIN_DEMO_DAYS, payload, config);
      router.push('/demo-days');
    } catch (error: any) {
      console.error('Error creating demo day:', error);

      // Check if it's a conflict error (409) for duplicate slug
      if (error?.response?.status === 409) {
        const errorMessage =
          error?.response?.data?.message || `A demo day with slug "${formData.slugURL}" already exists.`;
        setSlugError(errorMessage);
      } else {
        alert('Failed to create demo day. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // Clear slug error when user modifies the slug or title
    if (name === 'slugURL' || name === 'title') {
      setSlugError('');
    }

    setFormData((prev) => {
      const updates: any = { [name]: value };

      // Auto-generate slugURL when title changes
      if (name === 'title') {
        updates.slugURL = slugify(value);
      }

      return {
        ...prev,
        ...updates,
      };
    });
  };

  const handleRichTextChange = (field: keyof CreateDemoDayDto, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Don't render if not authenticated or not a directory admin
  if (!authToken || (!isLoading && user && !isDirectoryAdmin)) {
    return null;
  }

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
              <label htmlFor="slugURL" className="mb-2 block text-sm font-medium text-gray-700">
                URL Slug *
              </label>
              <input
                type="text"
                id="slugURL"
                name="slugURL"
                required
                value={formData.slugURL}
                onChange={handleInputChange}
                className={`w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 ${
                  slugError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
                placeholder="demo-day-slug"
              />
              {slugError ? (
                <p className="mt-1 text-sm text-red-600">{slugError}</p>
              ) : (
                <p className="mt-1 text-sm text-gray-500">
                  This will be used in the URL: /demo-days/{formData.slugURL || 'demo-day-slug'}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="shortDescription" className="mb-2 block text-sm font-medium text-gray-700">
                Short Description
              </label>
              <RichTextEditor
                id="shortDescription"
                value={formData.shortDescription || ''}
                onChange={(value) => handleRichTextChange('shortDescription', value)}
                placeholder="Enter a brief description"
                maxLength={250}
              />
            </div>

            <div>
              <label htmlFor="description" className="mb-2 block text-sm font-medium text-gray-700">
                Description
              </label>
              <RichTextEditor
                id="description"
                value={formData.description || ''}
                onChange={(value) => handleRichTextChange('description', value)}
                placeholder="Enter demo day description"
              />
            </div>

            <div>
              <label htmlFor="startDate" className="mb-2 block text-sm font-medium text-gray-700">
                Start Date (UTC) *
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
              <label htmlFor="endDate" className="mb-2 block text-sm font-medium text-gray-700">
                End Date (UTC) *
              </label>
              <input
                type="datetime-local"
                id="endDate"
                name="endDate"
                required
                value={formData.endDate}
                onChange={handleInputChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="approximateStartDate" className="mb-2 block text-sm font-medium text-gray-700">
                Approximate Start Date
              </label>
              <input
                type="text"
                id="approximateStartDate"
                name="approximateStartDate"
                value={formData.approximateStartDate || ''}
                onChange={handleInputChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Q1 2025, Spring 2025"
              />
            </div>

            <div>
              <label htmlFor="host" className="mb-2 block text-sm font-medium text-gray-700">
                Host *
              </label>
              <select
                id="host"
                name="host"
                required
                value={formData.host}
                onChange={handleInputChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a host</option>
                {DEMO_DAY_HOSTS.map((host) => (
                  <option key={host} value={host}>
                    {host}
                  </option>
                ))}
              </select>
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
                <option value="REGISTRATION_OPEN">Registration Open</option>
                <option value="EARLY_ACCESS">Early Access</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
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
