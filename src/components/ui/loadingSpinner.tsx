'use client';

import React from 'react';
import { PawLoader } from './pawLoader';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'blue' | 'white' | 'gray';
}

const sizeClasses = {
  sm: 'scale-75',
  md: 'scale-90',
  lg: 'scale-110',
  xl: 'scale-125',
};

const colorClasses = {
  blue: 'text-[#2f6690]',
  white: 'text-white',
  gray: 'text-gray-600',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className,
  color = 'blue',
}) => {
  return <PawLoader className={`${sizeClasses[size]} ${colorClasses[color]} ${className || ''}`} />;
};
