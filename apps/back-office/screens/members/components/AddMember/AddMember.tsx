import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import s from './AddMember.module.scss';
import { MemberForm } from '../MemberForm/MemberForm';
import clsx from 'clsx';
import { PlusIcon } from '../icons';

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  className?: string;
}

export const AddMember = ({ className }: Props) => {
  const [open, setOpen] = useState(false);

  const handleSignUpClick = () => {
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

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
            style={{ zIndex: 100, position: 'absolute' }}
          >
            <MemberForm onClose={handleClose} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
