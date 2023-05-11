// Toaster.js

import React from 'react';
import { ToastContainer, ToastPosition, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.min.css';

interface ToasterProps {
  position?: ToastPosition;
  autoClose?: number;
  hideProgressBar?: boolean;
  closeOnClick?: boolean;
  pauseOnHover?: boolean;
  draggable?: boolean;
}

function Toaster({
  position = toast.POSITION.BOTTOM_RIGHT,
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
