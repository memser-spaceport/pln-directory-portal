import React, { useEffect, useState } from 'react';
import Modal from '../modal/modal';
import clsx from 'clsx';
import { useCookie } from 'react-use';
import { useUpdateTeamPitchParticipant } from '../../hooks/team-pitches/useUpdateTeamPitchParticipant';
import { toast } from 'react-toastify';

type EditEmailTemplateVariablesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  pitchUid: string;
  participantUid: string;
  participantName?: string;
  participantEmail?: string;
  emailTemplateVariables: Record<string, string> | null | undefined;
  canEdit: boolean;
};

function parseTemplateVariables(raw: string): { value: Record<string, string> | null; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { value: null, error: 'Invalid JSON' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { value: null, error: 'JSON must be an object of string key-value pairs' };
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof entry !== 'string') {
      return { value: null, error: `Value for "${key}" must be a string` };
    }
    result[key] = entry;
  }

  return { value: result, error: null };
}

export const EditEmailTemplateVariablesModal: React.FC<EditEmailTemplateVariablesModalProps> = ({
  isOpen,
  onClose,
  pitchUid,
  participantUid,
  participantName,
  participantEmail,
  emailTemplateVariables,
  canEdit,
}) => {
  const [authToken] = useCookie('plnadmin');
  const updateParticipant = useUpdateTeamPitchParticipant();
  const [jsonText, setJsonText] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const vars = emailTemplateVariables && Object.keys(emailTemplateVariables).length > 0 ? emailTemplateVariables : {};
    setJsonText(JSON.stringify(vars, null, 2));
    setError(null);
  }, [isOpen, emailTemplateVariables]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSave = async () => {
    if (!authToken || !canEdit) return;

    const { value, error: parseError } = parseTemplateVariables(jsonText);
    if (parseError) {
      setError(parseError);
      return;
    }

    try {
      await updateParticipant.mutateAsync({
        authToken,
        pitchUid,
        participantUid,
        data: { emailTemplateVariables: value },
      });
      toast.success('Template variables updated');
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update template variables');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Email template variables</h3>
          {(participantName || participantEmail) && (
            <p className="mt-1 text-sm text-gray-500">
              {[participantName, participantEmail].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="px-6 py-4">
          <p className="mb-3 text-sm text-gray-600">
            Free-form JSON object with string values. Keys are available as Handlebars variables in invite and follow-up
            emails.
          </p>
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              if (error) setError(null);
            }}
            disabled={!canEdit || updateParticipant.isPending}
            rows={12}
            spellCheck={false}
            className={clsx(
              'w-full rounded-lg border px-3 py-2 font-mono text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-1',
              error
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500',
              (!canEdit || updateParticipant.isPending) && 'bg-gray-50 opacity-70'
            )}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={updateParticipant.isPending}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {canEdit ? 'Cancel' : 'Close'}
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={updateParticipant.isPending}
                className={clsx(
                  'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm',
                  updateParticipant.isPending ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                )}
              >
                {updateParticipant.isPending ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
