import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import logoImg from '@assets/1779750955962_1781639454518.png';

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
          className="w-32 h-32 bg-white rounded-3xl overflow-hidden shadow-2xl mb-8"
          initial={{ y: -50, opacity: 0, rotate: -15 }}
          animate={phase >= 1 ? { y: 0, opacity: 1, rotate: 0 } : { y: -50, opacity: 0, rotate: -15 }}
          transition={{ type: 'spring', damping: 15, stiffness: 200 }}>
          <img src={logoImg} alt="الطيبات" className="w-full h-full object-contain p-1" />
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
            <svg viewBox="0 0 512 512" className="w-7 h-7">
              <path fill="#00D2FF" d="M48 59.5v393c0 4.3 2.3 8.1 5.8 10.2L276 256 53.8 49.3C50.3 51.4 48 55.2 48 59.5z"/>
              <path fill="#00E676" d="M345 174L91.7 33.7C84 29.4 75 30 68.4 34.3L276 256 345 174z"/>
              <path fill="#FFC400" d="M464 256c0-9.6-5.1-18.5-13.4-23.3L385.5 196 304 256l81.5 60 65.1-36.7C458.9 274.5 464 265.6 464 256z"/>
              <path fill="#FF3D00" d="M68.4 477.7C75 482 84 482.6 91.7 478.3L345 338l-69-82L68.4 477.7z"/>
            </svg>
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
