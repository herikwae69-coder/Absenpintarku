import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  glowColor?: string;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, glowColor = "rgba(59, 130, 246, 0.5)", ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="relative group w-full">
        <Input
          {...props}
          ref={ref}
          type={showPassword ? "text" : "password"}
          className={`${className} pr-12 transition-all duration-300 ${
            showPassword 
              ? `border-blue-400 shadow-[0_0_15px_${glowColor}] bg-blue-500/5` 
              : ""
          }`}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1"
        >
          <AnimatePresence mode="wait" initial={false}>
            {showPassword ? (
              <motion.div
                key="eye-open"
                initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                transition={{ duration: 0.2 }}
              >
                <EyeIcon className="w-5 h-5 text-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
              </motion.div>
            ) : (
              <motion.div
                key="eye-closed"
                initial={{ opacity: 0, scale: 0.5, rotate: 45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
                transition={{ duration: 0.2 }}
              >
                <EyeOffIcon className="w-5 h-5" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
