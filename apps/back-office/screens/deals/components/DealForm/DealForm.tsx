import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Deal, DealStatus, TDealForm } from '../../types/deal';
import s from './DealForm.module.scss';

const CATEGORIES = [
  'Analytics',
  'CDN',
  'Database',
  'Design',
  'Development',
  'DevOps',
  'Monitoring',
  'Project Management',
  'Security',
  'Other',
];

const STATUSES: { value: DealStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DEACTIVATED', label: 'Deactivated' },
];

interface Props {
  onClose: () => void;
  onSubmit: (data: TDealForm) => Promise<void>;
  initialData?: Deal;
}

export const DealForm = ({ onClose, onSubmit, initialData }: Props) => {
  const isEdit = Boolean(initialData);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<TDealForm>({
    defaultValues: {
      vendorName: '',
      category: '',
      shortDescription: '',
      fullDescription: '',
      redemptionInstructions: '',
      status: 'DRAFT',
    },
  });

  useEffect(() => {
    if (initialData) {
      reset({
        vendorName: initialData.vendorName,
        category: initialData.category,
        shortDescription: initialData.shortDescription,
        fullDescription: initialData.fullDescription,
        redemptionInstructions: initialData.redemptionInstructions,
        status: initialData.status,
      });
    }
  }, [initialData, reset]);

  const handleFormSubmit = async (data: TDealForm) => {
    await onSubmit(data);
    onClose();
  };

  return (
    <div className={s.modal}>
      <div className={s.modalContent}>
        <button type="button" className={s.closeButton} onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className={s.header}>
          <h4 className={s.title}>{isEdit ? 'Edit Deal' : 'Add Deal'}</h4>
          <p className={s.desc}>
            {isEdit ? 'Update the deal details below.' : 'Fill in the details to create a new deal.'}
          </p>
        </div>

        <form noValidate onSubmit={handleSubmit(handleFormSubmit)} className={s.form}>
          {/* Vendor Name */}
          <div className={s.field}>
            <label className={s.label} htmlFor="vendorName">
              Vendor Name <span className={s.required}>*</span>
            </label>
            <input
              id="vendorName"
              className={s.input}
              placeholder="e.g. Vercel"
              {...register('vendorName', { required: 'Vendor name is required' })}
            />
            {errors.vendorName && <p className={s.error}>{errors.vendorName.message}</p>}
          </div>

          {/* Category */}
          <div className={s.field}>
            <label className={s.label} htmlFor="category">
              Category <span className={s.required}>*</span>
            </label>
            <select
              id="category"
              className={s.select}
              {...register('category', { required: 'Category is required' })}
            >
              <option value="">Select a category</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {errors.category && <p className={s.error}>{errors.category.message}</p>}
          </div>

          {/* Short Description */}
          <div className={s.field}>
            <label className={s.label} htmlFor="shortDescription">
              Short Description <span className={s.required}>*</span>
            </label>
            <input
              id="shortDescription"
              className={s.input}
              placeholder="Brief one-line description"
              {...register('shortDescription', { required: 'Short description is required' })}
            />
            {errors.shortDescription && <p className={s.error}>{errors.shortDescription.message}</p>}
          </div>

          {/* Full Description */}
          <div className={s.field}>
            <label className={s.label} htmlFor="fullDescription">
              Full Description <span className={s.required}>*</span>
            </label>
            <textarea
              id="fullDescription"
              className={s.textarea}
              rows={4}
              placeholder="Detailed description of the deal"
              {...register('fullDescription', { required: 'Full description is required' })}
            />
            {errors.fullDescription && <p className={s.error}>{errors.fullDescription.message}</p>}
          </div>

          {/* Redemption Instructions */}
          <div className={s.field}>
            <label className={s.label} htmlFor="redemptionInstructions">
              Redemption Instructions <span className={s.required}>*</span>
            </label>
            <textarea
              id="redemptionInstructions"
              className={s.textarea}
              rows={3}
              placeholder="Step-by-step instructions to redeem this deal"
              {...register('redemptionInstructions', { required: 'Redemption instructions are required' })}
            />
            {errors.redemptionInstructions && <p className={s.error}>{errors.redemptionInstructions.message}</p>}
          </div>

          {/* Status */}
          <div className={s.field}>
            <label className={s.label} htmlFor="status">
              Status
            </label>
            <select id="status" className={s.select} {...register('status')}>
              {STATUSES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          <div className={s.footer}>
            <button
              type="button"
              className={s.secondaryBtn}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </button>
            <button type="submit" className={s.primaryBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DealForm;
