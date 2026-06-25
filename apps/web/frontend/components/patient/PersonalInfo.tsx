'use client';

import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, User, Phone } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import type { PatientFormState } from '@/types/patient';

interface PersonalInfoProps {
  form: PatientFormState;
  errors: Record<string, string>;
  onUpdate: (patch: Partial<PatientFormState>) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function PersonalInfo({ form, errors, onUpdate, onContinue }: PersonalInfoProps) {
  return (
    <motion.div
      key="p1"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col justify-between"
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary">Personal details</h2>
          <p className="text-base text-text-secondary">Please provide accurate details to match with queue records.</p>
        </div>

        <div className="space-y-4">
          <Input
            label="Full Name *"
            placeholder="e.g. Ama Owusu"
            value={form.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            error={errors.name}
            icon={<User className="w-4 h-4" />}
            autoComplete="name"
            maxLength={100}
          />

          <Input
            label="Phone Number *"
            type="tel"
            placeholder="e.g. +233 20 123 4567"
            value={form.phone}
            onChange={(e) => onUpdate({ phone: e.target.value })}
            error={errors.phone}
            icon={<Phone className="w-4 h-4" />}
            autoComplete="tel"
            inputMode="tel"
            maxLength={20}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Age *"
              type="number"
              min="1"
              max="120"
              step="1"
              inputMode="numeric"
              placeholder="Age"
              value={form.age}
              onChange={(e) => onUpdate({ age: e.target.value })}
              error={errors.age}
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-text-secondary">Sex</label>
              <select
                value={form.sex}
                onChange={(e) => onUpdate({ sex: e.target.value })}
                className={`w-full border rounded-lg px-3.5 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-brand ${
                  errors.sex ? 'border-red-500 focus:ring-red-500' : 'border-surface-border'
                }`}
              >
                <option value="">Select sex</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
              {errors.sex && <p className="text-sm text-red-600 font-medium">{errors.sex}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6">
        <button
          onClick={onContinue}
          className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-4 px-5 rounded-lg flex items-center justify-center gap-3 transition-all shadow shadow-brand/20 hover:shadow-md text-lg"
        >
          <span>Continue to symptoms</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}
