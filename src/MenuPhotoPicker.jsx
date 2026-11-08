import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Trash2, Upload, X } from 'lucide-react';
import { useL } from './staff-ui';
import { prepareMenuImage } from './menu-image.mjs';

const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());
const nativeCamera = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function MenuPhotoPicker({ image, blob, onSelect, onImageChange, disabled, onBusyChange }) {
  const { t } = useL();
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const video = useRef(null);
  const stream = useRef(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const captureLock = useRef(false);
  const [preview, setPreview] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!blob) { setPreview(''); return; }
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; stopTracks(stream.current); };
  }, []);
  useEffect(() => { onBusyChange?.(preparing || cameraOpen); }, [preparing, cameraOpen, onBusyChange]);

  useEffect(() => {
    if (!cameraStream || !video.current) return;
    video.current.srcObject = cameraStream;
    video.current.play().catch(() => {});
  }, [cameraStream]);

  function stopCamera() {
    stopTracks(stream.current); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraOpen(false); setCameraReady(false); setCameraStream(null);
  }
  function cancelCamera() {
    generation.current += 1;
    stopCamera(); setPreparing(false); setError('');
  }
  function imageError(code) {
    if (['file-too-large', 'image-too-large', 'image-size'].includes(code)) return t('ຮູບໃຫຍ່ເກີນໄປ · ເລືອກຮູບທີ່ນ້ອຍກວ່າ', 'รูปใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง');
    return t('ເປີດຮູບນີ້ບໍ່ໄດ້ · ລອງຮູບ JPG, PNG ຫຼື WebP', 'เปิดรูปนี้ไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP');
  }
  async function selectFile(file) {
    if (!file || disabled) return;
    const token = ++generation.current;
    setPreparing(true); setError('');
    try {
      const prepared = await prepareMenuImage(file);
      if (!mounted.current || token !== generation.current) return;
      onSelect(prepared); stopCamera();
    } catch (failure) {
      if (mounted.current && token === generation.current) setError(imageError(failure?.code));
    } finally {
      if (mounted.current && token === generation.current) setPreparing(false);
    }
  }
  function fileChanged(event) { const file = event.target.files?.[0]; event.target.value = ''; void selectFile(file); }
  async function openCamera() {
    if (disabled || preparing) return;
    setError('');
    if (nativeCamera()) { cameraInput.current?.click(); return; }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('ເປີດກ້ອງບໍ່ໄດ້ · ກະລຸນາເລືອກຮູບຈາກເຄື່ອງ', 'เปิดกล้องไม่ได้ กรุณาเลือกรูปจากเครื่อง'));
      return;
    }
    const token = ++generation.current;
    setCameraOpen(true); setCameraReady(false);
    try {
      const captured = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false });
      if (!mounted.current || token !== generation.current) { stopTracks(captured); return; }
      stream.current = captured;
      setCameraStream(captured);
    } catch (failure) {
      if (!mounted.current || token !== generation.current) return;
      stopCamera();
      setError(failure?.name === 'NotAllowedError' || failure?.name === 'SecurityError'
        ? t('ຍັງບໍ່ໄດ້ອະນຸຍາດກ້ອງ · ເປີດສິດກ້ອງ ຫຼື ເລືອກຮູບຈາກເຄື່ອງ', 'ยังไม่ได้อนุญาตกล้อง เปิดสิทธิ์กล้องหรือเลือกรูปจากเครื่อง')
        : t('ບໍ່ພົບກ້ອງທີ່ໃຊ້ໄດ້ · ເລືອກຮູບຈາກເຄື່ອງແທນ', 'ไม่พบกล้องที่ใช้งานได้ กรุณาเลือกรูปจากเครื่องแทน'));
    }
  }
  async function takePhoto() {
    if (!cameraReady || !video.current?.videoWidth || preparing || captureLock.current) return;
    captureLock.current = true; setPreparing(true); setError('');
    const token = generation.current;
    try {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, 1600 / Math.max(video.current.videoWidth, video.current.videoHeight));
      canvas.width = Math.round(video.current.videoWidth * ratio); canvas.height = Math.round(video.current.videoHeight * ratio);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('camera-capture');
      context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
      const photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
      if (!mounted.current || token !== generation.current) return;
      if (!photo) throw new Error('camera-capture');
      await selectFile(photo);
    } catch {
      if (mounted.current && token === generation.current) setError(t('ຖ່າຍຮູບບໍ່ສຳເລັດ · ລອງອີກຄັ້ງ', 'ถ่ายรูปไม่สำเร็จ กรุณาลองอีกครั้ง'));
    } finally {
      captureLock.current = false;
      if (mounted.current && token === generation.current) setPreparing(false);
    }
  }
  const source = preview || (image && !image.endsWith('/menu-placeholder.svg') ? image : '');
  return <section className="menu-photo-editor" aria-labelledby="menu-photo-heading">
    <div className="menu-editor-section-head"><h3 id="menu-photo-heading">{t('ຮູບອາຫານ', 'รูปอาหาร')}</h3><span>{t('ບໍ່ບັງຄັບ', 'ไม่บังคับ')}</span></div>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="menu-file-input" aria-label={t('ເລືອກຮູບຈາກເຄື່ອງ', 'เลือกรูปจากเครื่อง')} disabled={disabled || preparing} onChange={fileChanged}/>
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="menu-file-input" aria-label={t('ຖ່າຍຮູບດ້ວຍກ້ອງ', 'ถ่ายรูปด้วยกล้อง')} disabled={disabled || preparing} onChange={fileChanged}/>
    {cameraOpen ? <div className="menu-camera">
      <div className="menu-camera-view"><video ref={video} autoPlay playsInline muted onLoadedMetadata={() => setCameraReady(true)} aria-label={t('ພາບຈາກກ້ອງ', 'ภาพจากกล้อง')}/>{!cameraReady && <span role="status">{t('ກຳລັງເປີດກ້ອງ…', 'กำลังเปิดกล้อง…')}</span>}</div>
      <p>{t('ຈັດຈານໃຫ້ຢູ່ກາງພາບ ແລ້ວກົດຖ່າຍ', 'จัดจานให้อยู่กลางภาพ แล้วกดถ่าย')}</p>
      <div className="menu-photo-actions"><button type="button" className="button primary" disabled={!cameraReady || preparing || disabled} onClick={takePhoto}><Camera size={19}/>{t('ຖ່າຍຮູບ', 'ถ่ายรูป')}</button><button type="button" className="button secondary" onClick={cancelCamera}><X size={19}/>{t('ຍົກເລີກ', 'ยกเลิก')}</button></div>
    </div> : <>
      <button type="button" className={`menu-photo-preview ${source ? 'has-photo' : ''}`} disabled={disabled || preparing} onClick={() => fileInput.current?.click()} aria-label={source ? t('ປ່ຽນຮູບອາຫານ', 'เปลี่ยนรูปอาหาร') : t('ເພີ່ມຮູບອາຫານ', 'เพิ่มรูปอาหาร')}>
        {source ? <img src={source} alt={t('ຮູບອາຫານທີ່ເລືອກ', 'รูปอาหารที่เลือก')}/> : <span className="menu-photo-empty"><ImagePlus size={36} strokeWidth={1.5}/><strong>{t('ເພີ່ມຮູບຂອງເມນູນີ້', 'เพิ่มรูปของเมนูนี้')}</strong><small>{t('ເລືອກຮູບ ຫຼື ຖ່າຍຈາກກ້ອງ', 'เลือกรูป หรือถ่ายจากกล้อง')}</small></span>}
        {preparing && <span className="menu-photo-working" role="status">{t('ກຳລັງຈັດຮູບ…', 'กำลังเตรียมรูป…')}</span>}
      </button>
      <div className="menu-photo-actions"><button type="button" className="button secondary" disabled={disabled || preparing} onClick={() => fileInput.current?.click()}><Upload size={18}/>{t('ເລືອກຮູບ', 'เลือกรูป')}</button><button type="button" className="button secondary" disabled={disabled || preparing} onClick={openCamera}><Camera size={18}/>{t('ຖ່າຍຮູບ', 'ถ่ายรูป')}</button></div>
      {source && <div className="menu-photo-caption"><span><Check size={15}/>{blob ? t('ເລືອກຮູບແລ້ວ', 'เลือกรูปแล้ว') : t('ຮູບປັດຈຸບັນ', 'รูปปัจจุบัน')}</span><button type="button" disabled={disabled || preparing} onClick={() => { onSelect(null); onImageChange(''); setError(''); }}><Trash2 size={15}/>{t('ເອົາຮູບອອກ', 'เอารูปออก')}</button></div>}
      <p className="menu-photo-help">{t('ຮູບຈະຖືກປັບຂະໜາດໃຫ້ໂຫຼດໄວ ເມື່ອກົດບັນທຶກ', 'ระบบปรับขนาดรูปให้โหลดเร็ว และอัปโหลดเมื่อกดบันทึก')}</p>
      <details className="menu-photo-url"><summary>{t('ໃຊ້ລິ້ງຮູບ', 'ใช้ลิงก์รูป')}</summary><label className="form-field"><span>{t('ລິ້ງຮູບອາຫານ', 'ลิงก์รูปอาหาร')}</span><input type="url" disabled={disabled || preparing} value={blob ? '' : image} placeholder="https://" onChange={event => { onSelect(null); onImageChange(event.target.value); }}/></label></details>
    </>}
    {error && <p role="alert" className="form-error menu-photo-error">{error}</p>}
  </section>;
}
