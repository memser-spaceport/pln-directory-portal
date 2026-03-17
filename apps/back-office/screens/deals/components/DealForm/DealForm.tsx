import React, { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Deal, DealAudience, DealStatus, TDealForm } from '../../types/deal';
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

const AUDIENCES: DealAudience[] = ['All Founders', 'PL Funded Founders'];
const STATUSES: DealStatus[] = ['Draft', 'Active', 'Deactivated'];

interface Props {
  onClose: () => void;
  onSubmit: (data: TDealForm) => Promise<void>;
  initialData?: Deal;
}

export const DealForm = ({ onClose, onSubmit, initialData }: Props) => {
  const isEdit = Boolean(initialData);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<TDealForm>({
    defaultValues: {
      vendorName: '',
      vendorLogo: null,
      category: '',
      audience: null,
      description: '',
      dealUrl: '',
      howToRedeem: '',
      status: 'Draft',
    },
  });

  useEffect(() => {
    if (initialData) {
      reset({
        vendorName: initialData.vendorName,
        vendorLogo: null,
        category: initialData.category,
        audience: initialData.audience,
        description: '',
        dealUrl: '',
        howToRedeem: '',
        status: initialData.status,
      });
    }
  }, [initialData, reset]);

  const logoFile = watch('vendorLogo');
  const logoPreview = logoFile ? URL.createObjectURL(logoFile) : initialData?.vendorLogoUrl ?? null;

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
          {/* Vendor Logo */}
          <div className={s.field}>
            <label className={s.label}>Vendor Logo</label>
            <div className={s.logoRow}>
              <div className={s.logoPreview}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" />
                ) : (
                  <span className={s.logoPlaceholder}>
                    {watch('vendorName')?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setValue('vendorLogo', file);
                }}
              />
              <button
                type="button"
                className={s.uploadBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? 'Change Logo' : 'Upload Logo'}
              </button>
            </div>
          </div>

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

          {/* Audience */}
          <div className={s.field}>
            <label className={s.label} htmlFor="audience">
              Audience <span className={s.required}>*</span>
            </label>
            <select
              id="audience"
              className={s.select}
              {...register('audience', { required: 'Audience is required' })}
            >
              <option value="">Select audience</option>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {errors.audience && <p className={s.error}>{errors.audience.message}</p>}
          </div>

          {/* Description */}
          <div className={s.field}>
            <label className={s.label} htmlFor="description">
              Description <span className={s.required}>*</span>
            </label>
            <textarea
              id="description"
              className={s.textarea}
              rows={3}
              placeholder="Brief description of the deal"
              {...register('description', { required: 'Description is required' })}
            />
            {errors.description && <p className={s.error}>{errors.description.message}</p>}
          </div>

          {/* Deal URL */}
          <div className={s.field}>
            <label className={s.label} htmlFor="dealUrl">
              Deal URL <span className={s.required}>*</span>
            </label>
            <input
              id="dealUrl"
              type="url"
              className={s.input}
              placeholder="https://"
              {...register('dealUrl', { required: 'Deal URL is required' })}
            />
            {errors.dealUrl && <p className={s.error}>{errors.dealUrl.message}</p>}
          </div>

          {/* How to Redeem */}
          <div className={s.field}>
            <label className={s.label} htmlFor="howToRedeem">
              How to Redeem <span className={s.required}>*</span>
            </label>
            <textarea
              id="howToRedeem"
              className={s.textarea}
              rows={3}
              placeholder="Instructions on how to redeem this deal"
              {...register('howToRedeem', { required: 'Redemption instructions are required' })}
            />
            {errors.howToRedeem && <p className={s.error}>{errors.howToRedeem.message}</p>}
          </div>

          {/* Status */}
          <div className={s.field}>
            <label className={s.label} htmlFor="status">
              Status
            </label>
            <select id="status" className={s.select} {...register('status')}>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
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
