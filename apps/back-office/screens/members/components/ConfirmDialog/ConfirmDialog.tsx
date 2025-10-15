import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import s from './ConfirmDialog.module.scss';
import { CloseIcon } from '../icons';

const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  onClose: () => void;
  onSubmit: () => void;
  title: string;
  desc: string;
  checkboxLabel: string;
  checkboxChecked: boolean;
  onCheckboxChange: (checked: boolean) => void;
}

export const ConfirmDialog = ({ onClose, onSubmit, title, desc, checkboxLabel, checkboxChecked, onCheckboxChange }: Props) => {
  return (
    <>
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
            <div className={s.modal}>
              <div className={s.modalContent}>
                <button type="button" className={s.closeButton} onClick={onClose}>
                  <CloseIcon />
                </button>
                <div className="m-0 flex flex-col gap-5 p-5">
                  <h4 className="text-xl font-bold">{title}</h4>
                  <p className="whitespace-normal text-sm text-[#455468]">{desc}</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkboxChecked}
                      onChange={(e) => onCheckboxChange(e.target.checked)}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sm text-[#455468]">{checkboxLabel}</span>
                  </label>
                </div>
                <div className="flex w-full justify-end gap-4 p-5">
                  <button type="button" className={s.secondaryBtn} onClick={onClose}>
                    Cancel
                  </button>
                  <button type="button" className={s.primaryBtn} onClick={onSubmit}>
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
