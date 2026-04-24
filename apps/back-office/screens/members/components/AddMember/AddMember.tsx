import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import s from './AddMember.module.scss';
import { MemberForm } from '../MemberForm/MemberForm';
import clsx from 'clsx';
import { PlusIcon } from '../icons';
import { TMemberForm } from '../../types/member';
import { saveRegistrationImage } from '../../../../utils/services/member';
import { useAddMember } from '../../../../hooks/members/useAddMember';
import { useRbacRoles } from '../../../../hooks/access-control/useRbacRoles';
import { usePoliciesList } from '../../../../hooks/access-control/usePoliciesList';
import { toast } from 'react-toastify';

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  className?: string;
  authToken: string;
  onClick?: () => void;
  showRbacSection?: boolean;
}

export const AddMember = ({ className, authToken, onClick, showRbacSection = false }: Props) => {
  const [open, setOpen] = useState(false);

  const handleSignUpClick = () => {
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    onClick?.();
  }, [onClick]);

  const { mutateAsync } = useAddMember();
  const { data: rbacRolesData } = useRbacRoles({ authToken });
  const { data: policiesData } = usePoliciesList({ authToken });

  const onSubmit = useCallback(
    async (formData: TMemberForm) => {
      try {
        if (!policiesData || !rbacRolesData) {
          toast.error('RBAC options still loading — try again in a moment.');
          return;
        }

        let image;

        if (formData.image) {
          const imgResponse = await saveRegistrationImage(formData.image);
          image = imgResponse?.image.uid;
        }

        const isApproved = formData.memberStateStatus?.value === 'Approved';
        const selectedPolicies = isApproved ? formData.rbacPolicies ?? [] : [];

        const policyByCode = new Map(policiesData.map((p) => [p.code, p]));
        const roleNameToCode = new Map(rbacRolesData.map((r) => [r.name, r.code]));

        const selectedRoleNames = new Set<string>();
        for (const p of selectedPolicies) {
          const policy = policyByCode.get(p.value);
          if (policy?.role) selectedRoleNames.add(policy.role);
        }

        const roleCodes: string[] = [];
        const unresolvedRoleNames: string[] = [];
        for (const name of selectedRoleNames) {
          const code = roleNameToCode.get(name);
          if (code) roleCodes.push(code);
          else unresolvedRoleNames.push(name);
        }
        if (unresolvedRoleNames.length > 0) {
          // eslint-disable-next-line no-console
          console.warn('[RBAC] Could not resolve roleCodes for role names:', unresolvedRoleNames);
        }

        const payload = {
          imageUid: image ?? '',
          name: formData.name,
          accessLevel: formData.accessLevel?.value ?? '',
          email: formData.email,
          joinDate: formData.joinDate?.toISOString() ?? '',
          bio: formData.bio,
          aboutYou: formData.aboutYou,
          country: formData.country ?? '',
          region: formData.state ?? '',
          city: formData.city ?? '',
          skills: formData.skills.map((item) => item.value),
          teamOrProjectURL: formData.teamOrProjectURL,
          teamMemberRoles: formData.teamsAndRoles.map((item) => {
            return {
              teamUid: item.team.value,
              role: item.role,
            };
          }),
          linkedinHandler: formData.linkedin,
          discordHandler: formData.discord,
          twitterHandler: formData.twitter,
          telegramHandler: formData.telegram,
          officeHours: formData.officeHours,
          githubHandler: formData.github,
          investorProfile: {
            investmentFocus: formData.investorProfile.investmentFocus.map(
              (item: { label: string; value: string }) => item.value
            ),
            typicalCheckSize: Number(formData.investorProfile.typicalCheckSize),
            secRulesAccepted: !!formData.investorProfile.secRulesAccepted,
            investInStartupStages: formData.investorProfile.investInStartupStages.map(
              (item: { label: string; value: string }) => item.value
            ),
            investInFundTypes: formData.investorProfile.investInFundTypes.map(
              (item: { label: string; value: string }) => item.value
            ),
            type: formData.investorProfile.type?.value || '',
          },
          memberState: formData.memberStateStatus?.value?.toUpperCase(),
          roleCodes,
          policyCodes: selectedPolicies.map((p) => p.value),
          permissionCodes: isApproved ? (formData.rbacExceptions ?? []).map((e) => e.value) : [],
        };

        const res = await mutateAsync({ payload, authToken });

        if (res?.data) {
          setOpen(false);
          toast.success('New member added successfully!');
        } else {
          toast.error('Failed to add new member. Please try again.');
        }
      } catch (e) {
        toast.error(e?.response?.data?.message ?? 'Failed to add new member. Please try again.');
      }
    },
    [mutateAsync, rbacRolesData, policiesData, authToken]
  );

  return (
    <>
      <button className={clsx(s.root, className)} onClick={handleSignUpClick}>
        <PlusIcon /> Add new
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="modal"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fade}
            transition={{ duration: 0.2 }}
            style={{ zIndex: 100, position: 'fixed', inset: '0 0 0 0' }}
          >
            <MemberForm
              onClose={handleClose}
              desc="Invite new members into the PL ecosystem."
              title="Add New Member"
              onSubmit={onSubmit}
              authToken={authToken}
              showRbacSection={showRbacSection}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
