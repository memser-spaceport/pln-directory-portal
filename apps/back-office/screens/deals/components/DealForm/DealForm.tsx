import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import AsyncCreatableSelect from 'react-select/async-creatable';
import Select, { StylesConfig } from 'react-select';
import { toast } from 'react-toastify';

import { Deal, TDealForm } from '../../types/deal';
import { DEAL_AUDIENCE_OPTIONS, DEAL_CATEGORY_OPTIONS } from '../../constants';
import { fetchTeamsForAutocomplete } from '../../../../utils/services/team';
import { saveRegistrationImage } from '../../../../utils/services/member';
import RichTextEditor from '../../../../components/common/rich-text-editor';
import { DealPreview } from '../DealPreview/DealPreview';
import s from './DealForm.module.scss';

interface Props {
  onClose: () => void;
  onSubmit: (data: TDealForm) => Promise<void>;
  initialData?: Deal;
}

type TeamOption = { value: string; label: string };

const loadTeamOptions = async (inputValue: string): Promise<TeamOption[]> => {
  if (!inputValue || inputValue.length < 1) return [];
  const results = await fetchTeamsForAutocomplete(inputValue);
  return results ?? [];
};

type SelectOption = { value: string; label: string };

const reactSelectStyles: StylesConfig<SelectOption> = {
  control: (base, state) => ({
    ...base,
    minHeight: '40px',
    borderRadius: '8px',
    borderColor: state.isFocused ? '#1b4dff' : 'rgba(14,15,17,0.16)',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(27,77,255,0.08)' : String(base.boxShadow),
    '&:hover': { borderColor: state.isFocused ? '#1b4dff' : 'rgba(14,15,17,0.24)' },
    fontSize: '14px',
  }),
  placeholder: (base) => ({ ...base, color: '#8897ae', fontSize: '14px' }),
  option: (base, state) => ({
    ...base,
    fontSize: '14px',
    backgroundColor: state.isSelected ? '#1b4dff' : state.isFocused ? '#f1f5f9' : 'white',
    color: state.isSelected ? 'white' : '#0a0c11',
  }),
  menu: (base) => ({ ...base, zIndex: 100 }),
};

export const DealForm = ({ onClose, onSubmit, initialData }: Props) => {
  const isEdit = Boolean(initialData);

  const methods = useForm<TDealForm>({
    defaultValues: {
      vendorName: '',
      vendorTeamUid: null,
      logoUid: null,
      category: '',
      audience: '',
      shortDescription: '',
      fullDescription: '',
      redemptionInstructions: '',
      status: 'DRAFT',
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { isSubmitting, isDirty, errors },
  } = methods;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [vendorOption, setVendorOption] = useState<TeamOption | null>(null);
  const [categoryOption, setCategoryOption] = useState<{ value: string; label: string } | null>(null);
  const [audienceOption, setAudienceOption] = useState<{ value: string; label: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    if (initialData) {
      reset({
        vendorName: initialData.vendorName,
        vendorTeamUid: initialData.vendorTeamUid,
        logoUid: initialData.logoUid,
        category: initialData.category,
        audience: initialData.audience,
        shortDescription: initialData.shortDescription,
        fullDescription: initialData.fullDescription,
        redemptionInstructions: initialData.redemptionInstructions,
        status: initialData.status,
      });

      setVendorOption(
        initialData.vendorName
          ? { value: initialData.vendorTeamUid ?? initialData.vendorName, label: initialData.vendorName }
          : null
      );

      setCategoryOption(initialData.category ? { value: initialData.category, label: initialData.category } : null);

      const audienceOpt = DEAL_AUDIENCE_OPTIONS.find((o) => o.value === initialData.audience);
      setAudienceOption(audienceOpt ? { value: audienceOpt.value, label: audienceOpt.label } : null);

      if (initialData.logoUrl) {
        setLogoPreviewUrl(initialData.logoUrl);
      }
    }
  }, [initialData, reset]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      setIsUploadingLogo(true);
      const result = await saveRegistrationImage(file);
      setValue('logoUid', result?.image?.uid ?? null);
    } catch {
      toast.error('Failed to upload logo. Please try again.');
      setLogoPreviewUrl(null);
      setValue('logoUid', null);
    } finally {
      setIsUploadingLogo(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoDelete = () => {
    setLogoPreviewUrl(null);
    setValue('logoUid', null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFormSubmit = async (data: TDealForm) => {
    const payload: TDealForm = {
      ...data,
      status: isEdit ? initialData?.status ?? 'DRAFT' : 'DRAFT',
    };
    await onSubmit(payload);
    onClose();
  };

  const handlePreviewClick = async () => {
    const isValid = await methods.trigger();
    if (isValid) setShowPreview(true);
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const data = methods.getValues();
      await onSubmit({ ...data, status: 'ACTIVE' });
      onClose();
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className={s.modal}>
      <div className={clsx(s.modalContent, { [s.previewMode]: showPreview })}>
        <FormProvider {...methods}>
          {showPreview && (
            <DealPreview
              data={methods.getValues()}
              logoPreviewUrl={logoPreviewUrl}
              isPublishing={isPublishing}
              publishDisabled={isEdit && !isDirty}
              onBack={() => setShowPreview(false)}
              onPublish={handlePublish}
            />
          )}
          <div style={{ display: showPreview ? 'none' : 'contents' }}>
          <div className={s.header}>
            <div>
              <h4 className={s.title}>{isEdit ? 'Edit Deal' : 'Create New Deal'}</h4>
              <p className={s.desc}>Fill in the details to add a new deal to the catalog.</p>
            </div>
            <button type="button" className={s.closeButton} onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5l10 10" stroke="#455468" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <form noValidate onSubmit={handleSubmit(handleFormSubmit)} className={s.form}>
            {/* ── Deal Details section ── */}
            <p className={s.sectionHeading}>Deal Details</p>

            <div className={s.formFields}>
              {/* Vendor row: avatar + team search */}
              <div className={s.vendorRow}>
                {/* Avatar */}
                <div className={s.avatarWrapper}>
                  <div className={s.avatar}>
                    {logoPreviewUrl ? (
                      <img src={logoPreviewUrl} alt="Vendor logo" className={s.avatarImg} />
                    ) : (
                      <div className={s.avatarPlaceholder}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="3" width="18" height="18" rx="4" stroke="#8897ae" strokeWidth="1.5" />
                          <circle cx="9" cy="9" r="2" stroke="#8897ae" strokeWidth="1.5" />
                          <path
                            d="M3 17l4-4 3 3 4-5 7 6"
                            stroke="#8897ae"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                    {/* Overlay buttons */}
                    <div className={s.avatarOverlay}>
                      <button
                        type="button"
                        className={s.avatarBtn}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingLogo || isSubmitting}
                        title="Upload logo"
                        aria-label="Upload logo"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path
                            d="M11 2.5L13.5 5M2 14l3.5-.5L13.5 5.5 10.5 2.5 2.5 10.5 2 14Z"
                            stroke="#455468"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {logoPreviewUrl && (
                        <button
                          type="button"
                          className={s.avatarBtn}
                          onClick={handleLogoDelete}
                          disabled={isSubmitting}
                          title="Remove logo"
                          aria-label="Remove logo"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                              d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"
                              stroke="#455468"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className={s.hiddenFileInput}
                    onChange={handleFileSelect}
                  />
                </div>

                {/* Vendor name async search */}
                <div className={s.vendorSelectWrapper}>
                  <div className={s.labelRow}>
                    <label className={s.label}>
                      Vendor name <span className={s.required}>*</span>
                    </label>
                  </div>
                  <AsyncCreatableSelect
                    instanceId="vendor-select"
                    placeholder="Search PL Network or enter the name"
                    loadOptions={loadTeamOptions}
                    value={vendorOption}
                    onChange={(option: TeamOption | null) => {
                      setVendorOption(option);
                      setValue('vendorName', option?.label ?? '', { shouldValidate: true, shouldDirty: true });
                      setValue('vendorTeamUid', option?.value ?? null, { shouldDirty: true });
                    }}
                    onCreateOption={(inputValue: string) => {
                      const newOption = { value: inputValue, label: inputValue };
                      setVendorOption(newOption);
                      setValue('vendorName', inputValue, { shouldValidate: true, shouldDirty: true });
                      setValue('vendorTeamUid', null, { shouldDirty: true });
                    }}
                    isClearable
                    styles={reactSelectStyles}
                    noOptionsMessage={({ inputValue }) => (inputValue ? 'No teams found' : 'Start typing to search')}
                    loadingMessage={() => 'Searching...'}
                    formatCreateLabel={(inputValue: string) => `Use "${inputValue}"`}
                  />
                  {/* Hidden input for vendorName validation */}
                  <input type="hidden" {...register('vendorName', { required: 'Vendor name is required' })} />
                  {errors.vendorName && <p className={s.error}>{errors.vendorName.message}</p>}
                </div>
              </div>

              {/* Category */}
              <div className={s.field}>
                <div className={s.labelRow}>
                  <label className={s.label}>
                    Category <span className={s.required}>*</span>
                  </label>
                </div>
                <Controller
                  name="category"
                  control={control}
                  rules={{ required: 'Category is required' }}
                  render={({ field }) => (
                    <Select
                      instanceId="category-select"
                      placeholder="Select category"
                      options={DEAL_CATEGORY_OPTIONS}
                      value={categoryOption}
                      onChange={(option: { value: string; label: string } | null) => {
                        setCategoryOption(option);
                        field.onChange(option?.value ?? '');
                      }}
                      styles={reactSelectStyles}
                    />
                  )}
                />
                {errors.category && <p className={s.error}>{errors.category.message}</p>}
              </div>

              {/* Audience */}
              <div className={s.field}>
                <div className={s.labelRow}>
                  <label className={s.label}>
                    Audience <span className={s.required}>*</span>
                  </label>
                </div>
                <Controller
                  name="audience"
                  control={control}
                  rules={{ required: 'Audience is required' }}
                  render={({ field }) => (
                    <Select
                      instanceId="audience-select"
                      placeholder="Select audience"
                      options={DEAL_AUDIENCE_OPTIONS}
                      value={audienceOption}
                      onChange={(option: { value: string; label: string } | null) => {
                        setAudienceOption(option);
                        field.onChange(option?.value ?? '');
                      }}
                      styles={reactSelectStyles}
                    />
                  )}
                />
                {errors.audience && <p className={s.error}>{errors.audience.message}</p>}
              </div>

              {/* Short Description */}
              <div className={s.field}>
                <div className={s.labelRow}>
                  <label className={s.label}>
                    Short Description <span className={s.required}>*</span>
                  </label>
                </div>
                <input
                  className={s.input}
                  maxLength={100}
                  placeholder="Enter short title describing the offer"
                  {...register('shortDescription', { required: 'Short description is required' })}
                />
                {errors.shortDescription ? (
                  <p className={s.error}>{errors.shortDescription.message}</p>
                ) : (
                  <p className={s.helperText}>Max. 100 characters.</p>
                )}
              </div>

              {/* Full Description */}
              <div className={s.field}>
                <div className={s.labelRow}>
                  <label className={s.label}>
                    Full Deal Description <span className={s.required}>*</span>
                  </label>
                </div>
                <Controller
                  name="fullDescription"
                  control={control}
                  rules={{ required: 'Full description is required' }}
                  render={({ field, fieldState }) => (
                    <RichTextEditor
                      value={field.value}
                      onChange={field.onChange}
                      maxLength={600}
                      placeholder="Explain the full details of the deal. Include eligibility, limits, and terms if known."
                      errorMessage={fieldState.error?.message}
                    />
                  )}
                />
                {errors.fullDescription ? (
                  <p className={s.error}>{errors.fullDescription.message}</p>
                ) : (
                  <p className={s.helperText}>Max 600 characters.</p>
                )}
              </div>
            </div>

            <div className={s.divider} />

            {/* ── Redemption Instructions section ── */}
            <p className={s.sectionHeading}>Redemption Instructions</p>

            <div className={s.formFields}>
              <div className={s.field}>
                <div className={s.labelRow}>
                  <label className={s.label}>
                    Redemption instructions <span className={s.required}>*</span>
                  </label>
                </div>
                <Controller
                  name="redemptionInstructions"
                  control={control}
                  rules={{ required: 'Redemption instructions are required' }}
                  render={({ field, fieldState }) => (
                    <RichTextEditor
                      value={field.value}
                      onChange={field.onChange}
                      maxLength={600}
                      placeholder={
                        'Explain how founders can redeem the deal.\nExample:\n1. Visit the signup link\n2. Create an account\n3. Enter the promo code during onboarding'
                      }
                      errorMessage={fieldState.error?.message}
                    />
                  )}
                />
                {errors.redemptionInstructions ? (
                  <p className={s.error}>{errors.redemptionInstructions.message}</p>
                ) : (
                  <p className={s.helperText}>Max 600 characters.</p>
                )}
              </div>
            </div>

            <div className={s.footer}>
              <button type="submit" className={s.secondaryBtn} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save as Draft'}
              </button>
              <button type="button" className={s.previewBtn} onClick={handlePreviewClick} disabled={isSubmitting}>
                Preview Deal
              </button>
            </div>
          </form>
          </div>
        </FormProvider>
      </div>
    </div>
  );
};

export default DealForm;
