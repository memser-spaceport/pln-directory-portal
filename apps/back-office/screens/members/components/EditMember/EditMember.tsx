import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { MemberForm } from '../MemberForm/MemberForm';
import clsx from 'clsx';
import { EditIcon } from '../icons';
import { Member, TMemberForm } from '../../types/member';
import { saveRegistrationImage } from '../../../../utils/services/member';

import s from './EditMember.module.scss';
import { useMember } from '../../../../hooks/members/useMember';
import { options } from '../MemberForm/StatusSelector';
import { useMemberFormOptions } from '../../../../hooks/members/useMemberFormOptions';
import { toast } from 'react-toastify';
import { useUpdateMember } from '../../../../hooks/members/useUpdateMember';
import { INVESTOR_PROFILE_CONSTANTS } from '../../../../utils/constants';
import { useAssignPolicy } from '../../../../hooks/access-control/useAssignPolicy';
import { useRevokePolicy } from '../../../../hooks/access-control/useRevokePolicy';
import { useGrantDirectPermissionV2 } from '../../../../hooks/access-control/useGrantDirectPermissionV2';
import { usePoliciesList } from '../../../../hooks/access-control/usePoliciesList';

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  className?: string;
  member: Member;
  authToken: string;
  showRbacSection?: boolean;
}

const MEMBER_STATE_MAP: Record<string, 'Pending' | 'Verified' | 'Approved' | 'Rejected'> = {
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const EditMember = ({ className, member, authToken, showRbacSection = false }: Props) => {
  const uid = member.uid;
  const [open, setOpen] = useState(false);

  const handleSignUpClick = () => {
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const { mutateAsync } = useUpdateMember();
  const { mutateAsync: assignPolicy } = useAssignPolicy();
  const { mutateAsync: revokePolicy } = useRevokePolicy();
  const { mutateAsync: grantPermission } = useGrantDirectPermissionV2();
  const { data: policiesData } = usePoliciesList({ authToken });
  const { data } = useMember(uid, open);
  const { data: formOptions } = useMemberFormOptions(open);

  // Capture initial RBAC state for diff on save
  const initialPolicyCodesRef = useRef<string[]>([]);
  const initialExceptionCodesRef = useRef<string[]>([]);

  const onSubmit = useCallback(
    async (formData: TMemberForm) => {
      try {
        let imageUid: string | undefined;

        if (formData.image) {
          const imgResponse = await saveRegistrationImage(formData.image);
          imageUid = imgResponse?.image?.uid;
        }

        const payload: {
          imageUid?: string;
          name: string;
          accessLevel: string;
          email: string;
          joinDate: string;
          bio: string;
          aboutYou: string;
          country: string;
          region: string;
          city: string;
          skills: string[];
          teamOrProjectURL: string;
          teamMemberRoles: { teamUid: string; role: string }[];
          linkedinHandler: string;
          discordHandler: string;
          twitterHandler: string;
          telegramHandler: string;
          officeHours: string;
          githubHandler: string;
          investorProfile?: {
            investmentFocus: string[];
            typicalCheckSize: number;
            secRulesAccepted: boolean;
            investInStartupStages: string[];
            investInFundTypes: string[];
            type: string;
          };
        } = {
          ...(imageUid !== undefined && { imageUid }),
          name: formData.name,
          accessLevel: formData.accessLevel?.value || '',
          email: formData.email,
          joinDate: formData.joinDate?.toISOString() ?? '',
          bio: formData.bio,
          aboutYou: formData.aboutYou,
          country: formData.country || '',
          region: formData.state || '',
          city: formData.city || '',
          skills: formData.skills.map((item) => item.value),
          teamOrProjectURL: formData.teamOrProjectURL,
          teamMemberRoles: formData.teamsAndRoles.map((item) => {
            return {
              teamUid: item.team?.value || '',
              role: item.role || '',
            };
          }),
          linkedinHandler: formData.linkedin,
          discordHandler: formData.discord,
          twitterHandler: formData.twitter,
          telegramHandler: formData.telegram,
          officeHours: formData.officeHours,
          githubHandler: formData.github,
        };

        if (formData.investorProfile) {
          payload.investorProfile = {
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
          };
        }

        const res = await mutateAsync({ uid, payload, authToken });

        if (res?.data) {
          const isApproved = formData.memberStateStatus?.value === 'Approved';

          if (isApproved) {
            const roleValues = (formData.rbacRoles ?? []).map((r) => r.value);
            const groupValues = (formData.rbacGroups ?? []).map((g) => g.value);
            const newMatchedPolicies = (policiesData ?? []).filter(
              (p) => roleValues.includes(p.role) && groupValues.includes(p.group)
            );
            const newPolicyCodes = newMatchedPolicies.map((p) => p.code);
            const newExceptionCodes = (formData.rbacExceptions ?? []).map((e) => e.value);

            const policiesToAssign = newPolicyCodes.filter(
              (c) => !initialPolicyCodesRef.current.includes(c)
            );
            const policiesToRevoke = initialPolicyCodesRef.current.filter(
              (c) => !newPolicyCodes.includes(c)
            );
            const exceptionsToGrant = newExceptionCodes.filter(
              (c) => !initialExceptionCodesRef.current.includes(c)
            );

            await Promise.allSettled([
              ...policiesToAssign.map((c) => assignPolicy({ memberUid: uid, policyCode: c, authToken })),
              ...policiesToRevoke.map((c) => revokePolicy({ memberUid: uid, policyCode: c, authToken })),
              ...exceptionsToGrant.map((c) =>
                grantPermission({ memberUid: uid, permissionCode: c, authToken })
              ),
            ]);
          } else {
            // Status changed to non-Approved — revoke all existing policies
            await Promise.allSettled(
              initialPolicyCodesRef.current.map((c) =>
                revokePolicy({ memberUid: uid, policyCode: c, authToken })
              )
            );
          }

          setOpen(false);
          toast.success('Member updated successfully!');
        } else {
          toast.error('Failed to update member. Please try again.');
        }
      } catch (e) {
        toast.error(e?.response?.data?.message ?? 'Failed to update member. Please try again.');
      }
    },
    [mutateAsync, assignPolicy, revokePolicy, grantPermission, policiesData, uid, authToken]
  );

  const initialData = useMemo(() => {
    if (!data || !formOptions) {
      return null;
    }

    // Derive memberStateStatus from member.memberState
    const stateValue = MEMBER_STATE_MAP[member.memberState ?? ''] ?? 'Pending';
    const memberStateStatus = { label: stateValue, value: stateValue } as TMemberForm['memberStateStatus'];

    // RBAC pre-population from the list member data
    const rbacRoles = (member.roles ?? []).map((r) => ({ label: r.name, value: r.code }));

    const memberPolicyCodes = (member.policies ?? []).map((p) => p.code);
    const assignedPolicies = (policiesData ?? []).filter((p) => memberPolicyCodes.includes(p.code));
    const groupValues = [...new Set(assignedPolicies.map((p) => p.group))];
    const rbacGroups = groupValues.map((g) => ({ label: g, value: g }));

    const rbacExceptions = (member.permissions ?? []).map((p) => ({ label: p.code, value: p.code }));

    // Capture initial state for diff-based save
    initialPolicyCodesRef.current = memberPolicyCodes;
    initialExceptionCodesRef.current = (member.permissions ?? []).map((p) => p.code);

    return {
      memberStateStatus,
      rbacRoles,
      rbacGroups,
      rbacExceptions,
      accessLevel: options.find((option) => option.value === data.accessLevel) ?? null,
      image: null,
      name: data.name ?? '',
      email: data.email ?? '',
      joinDate: data.plnStartDate ? new Date(data.plnStartDate) : null,
      teamOrProjectURL: data.teamOrProjectURL ?? '',
      teamsAndRoles:
        data.teamMemberRoles?.map((item) => {
          const _team = formOptions.teams.find((team) => team.teamUid === item.teamUid);
          return { team: _team ? { value: _team.teamUid, label: _team.teamTitle } : null, role: item.role };
        }) ?? [],
      bio: data.bio ?? '',
      aboutYou: data.aboutYou ?? '',
      country: data.location?.country ?? '',
      state: data.location?.region ?? '',
      city: data.location?.city ?? '',
      skills: data.skills?.map((item) => ({ value: item.id, label: item.name })) ?? [],
      discord: data.discordHandler ?? '',
      github: data.githubHandler ?? '',
      linkedin: data.linkedinHandler ?? '',
      officeHours: data.officeHours ?? '',
      telegram: data.telegramHandler ?? '',
      twitter: data.twitterHandler ?? '',
      investorProfile: data.investorProfile
        ? {
            investmentFocus: (data.investorProfile?.investmentFocus ?? []).map((focus: string) => ({
              label: focus,
              value: focus,
            })),
            typicalCheckSize: data.investorProfile?.typicalCheckSize ?? null,
            secRulesAccepted: !!data.investorProfile?.secRulesAccepted,
            investInStartupStages: (data.investorProfile?.investInStartupStages ?? []).map((stage: string) => ({
              label: stage,
              value: stage,
            })),
            investInFundTypes: (data.investorProfile?.investInFundTypes ?? []).map((fundType: string) => ({
              label: fundType,
              value: fundType,
            })),
            type: data.investorProfile?.type
              ? INVESTOR_PROFILE_CONSTANTS.INVESTOR_TYPES.find(
                  (option) => option.value === data.investorProfile.type
                ) || null
              : null,
          }
        : undefined,
    };
  }, [data, formOptions, member, policiesData]);

  return (
    <>
      <button className={clsx(s.root, className)} onClick={handleSignUpClick}>
        <EditIcon /> Edit
      </button>
      <AnimatePresence>
        {open && initialData && (
          <motion.div
            className="modal"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fade}
            transition={{ duration: 0.2 }}
            style={{ zIndex: 100, position: 'absolute' }}
          >
            <MemberForm
              onClose={handleClose}
              title="Edit Member"
              desc="Verify the information or change the member's information."
              onSubmit={onSubmit}
              initialData={initialData}
              existingImageUrl={data?.image?.url}
              authToken={authToken}
              showRbacSection={showRbacSection}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
