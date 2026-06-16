import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5Outro() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: 'var(--color-primary)' }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
      
      <motion.div 
        className="absolute inset-0 opacity-20"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, white 2px, transparent 0)', backgroundSize: '30px 30px' }}
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />

      <div className="relative z-10 text-center px-6 flex flex-col items-center" dir="rtl">
        
        <motion.div
          className="w-32 h-32 bg-white rounded-3xl flex items-center justify-center shadow-2xl mb-8"
          initial={{ y: -50, opacity: 0, rotate: -15 }}
          animate={phase >= 1 ? { y: 0, opacity: 1, rotate: 0 } : { y: -50, opacity: 0, rotate: -15 }}
          transition={{ type: 'spring', damping: 15, stiffness: 200 }}>
          <span className="text-primary font-black text-4xl">ط</span>
        </motion.div>

        <motion.h1 
          className="text-[15vw] font-black text-white leading-none drop-shadow-md mb-4"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={phase >= 1 ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, delay: 0.2 }}>
          الطيبات
        </motion.h1>
        
        <motion.p 
          className="text-[5vw] text-accent font-bold mb-12"
          initial={{ opacity: 0, y: 10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ delay: 0.4 }}>
          كل أكل بيتك بمكان واحد
        </motion.p>

        <motion.div
          className="flex flex-col gap-4 w-full max-w-[200px]"
          initial={{ y: 30, opacity: 0 }}
          animate={phase >= 2 ? { y: 0, opacity: 1 } : { y: 30, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}>
          <div className="bg-black text-white rounded-xl py-3 px-6 flex items-center justify-center gap-3 shadow-xl border border-gray-800">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M3.609 1.814L13.792 12 3.61 22.186c-.147-.184-.235-.42-.235-.686V2.5c0-.266.088-.502.234-.686zM14.887 13.094l2.585 2.585a1.5 1.5 0 010 2.122l-1.077 1.076-4.524-4.524 3.016-1.259zM15.421 11.5L5.138 1.218l4.49-4.49 1.066 1.065a1.5 1.5 0 010 2.122l-2.613 2.614 7.34 8.971z"/></svg>
            <div className="text-right">
              <div className="text-[10px] text-gray-300">GET IT ON</div>
              <div className="font-bold text-sm">Google Play</div>
            </div>
          </div>
          
          <p className="text-white font-bold text-[5vw] mt-2">حمّل التطبيق الآن</p>
        </motion.div>
        
      </div>
    </motion.div>
  );
}
