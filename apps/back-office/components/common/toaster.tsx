// Toaster.js

import React from 'react';
// react-toastify injects its own CSS from the main entry.
import { ToastContainer, ToastPosition } from 'react-toastify';

interface ToasterProps {
  position?: ToastPosition;
  autoClose?: number;
  hideProgressBar?: boolean;
  closeOnClick?: boolean;
  pauseOnHover?: boolean;
  draggable?: boolean;
}

function Toaster({
  position = 'bottom-right',
  autoClose = 5000,
  hideProgressBar = false,
  closeOnClick = true,
  pauseOnHover = true,
  draggable = true,
}: ToasterProps) {
  return (
    <ToastContainer
      position={position}
      autoClose={autoClose}
      hideProgressBar={hideProgressBar}
      closeOnClick={closeOnClick}
      pauseOnHover={pauseOnHover}
      draggable={draggable}
    />
  );
}

export default Toaster;
