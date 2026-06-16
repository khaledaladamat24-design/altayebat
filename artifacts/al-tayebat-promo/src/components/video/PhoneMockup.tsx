import { motion } from 'framer-motion';

export function PhoneMockup({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <motion.div className={`relative w-[65vw] max-w-[320px] aspect-[9/19.5] bg-black rounded-[3rem] p-2 shadow-2xl border-4 border-gray-800 ${className}`}>
      <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-20">
        <div className="w-[40%] h-full bg-black rounded-b-2xl"></div>
      </div>
      <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
        {children}
      </div>
    </motion.div>
  );
}
