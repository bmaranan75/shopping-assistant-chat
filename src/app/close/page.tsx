'use client';

import { useEffect, useState, useCallback } from 'react';

import { Button } from '@/components/ui/button';

export default function PopupClosePage() {
  const [isClosing, setIsClosing] = useState(true);

  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.close();
      } catch (err) {
        console.error(err);
        setIsClosing(false);
      }
    }
  }, []);

  useEffect(() => {
    // Attempt to close the window on load
    handleClose();
  }, [handleClose]);

  return isClosing ? (
    <></>
  ) : (
    <div className="flex items-center justify-center min-h-screen bg-safeway-light-gray">
      <div className="text-center safeway-card p-8 max-w-md">
        <p className="mb-4 text-lg text-safeway-dark-gray">You have been signed out successfully.</p>
        <p className="mb-6 text-sm text-safeway-dark-gray/70">You can now close this window.</p>
        <Button onClick={handleClose} className="safeway-button-primary">Close Window</Button>
      </div>
    </div>
  );
}
