import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import s from './AddMember.module.scss';
import { MemberForm } from '../MemberForm/MemberForm';

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const AddMember = () => {
  const [open, setOpen] = useState(false);

  const handleSignUpClick = () => {
    setOpen(true);
  };

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <button className={s.root} onClick={handleSignUpClick}>
        Add new
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="modal"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fade}
            transition={{ duration: 0.5 }}
            style={{ zIndex: 10, position: 'absolute' }}
          >
            <MemberForm onClose={handleClose} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
