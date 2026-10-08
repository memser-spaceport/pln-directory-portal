import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../modal/modal';
import { WEB_UI_BASE_URL } from '../../utils/constants';
import { emailTemplateTokens, mergeEmailTemplate, wrapSpvSpotlightEmail } from './spv-spotlight-email-shell';

type PreviewSpvEmailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  subject: string;
  body: string;
  defaults: Record<string, string>;
};

export const PreviewSpvEmailModal: React.FC<PreviewSpvEmailModalProps> = ({
  isOpen,
  onClose,
  label,
  subject,
  body,
  defaults,
}) => {
  const tokens = useMemo(() => emailTemplateTokens(`${subject}\n${body}`), [subject, body]);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const next: Record<string, string> = {};
    for (const token of tokens) {
      next[token.key] = defaults[token.key] ?? '';
    }
    setValues(next);
  }, [isOpen, tokens, defaults]);

  const preferencesUrl = `${WEB_UI_BASE_URL.replace(/\/$/, '')}/settings/email`;
  const previewSubject = mergeEmailTemplate(subject, values);
  const previewHtml = wrapSpvSpotlightEmail(mergeEmailTemplate(body, values), preferencesUrl);

  return (
    <Modal isOpen={isOpen} onClose={onClose} modalClassName="w-full max-w-3xl">
      <div className="w-full rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Preview email</h3>
          <p className="mt-1 text-sm text-gray-500">{label}</p>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-6 py-4">
          {tokens.length > 0 ? (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tokens.map((token) => (
                <label key={token.key} className="block text-sm text-gray-700">
                  <span className="mb-1 block font-medium">{`{{${token.key}}}`}</span>
                  <input
                    value={values[token.key] ?? ''}
                    placeholder={token.fallback || undefined}
                    onChange={(event) => setValues({ ...values, [token.key]: event.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-gray-500">This template has no variables.</p>
          )}
          <p className="mb-3 text-sm text-gray-900">
            <span className="font-medium">Subject: </span>
            {previewSubject || '—'}
          </p>
          <iframe
            title={`${label} email preview`}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={previewHtml}
            className="h-[640px] w-full rounded-lg border border-gray-200 bg-[#f6f7fb]"
          />
        </div>
        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
