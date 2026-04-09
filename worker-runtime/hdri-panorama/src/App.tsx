import React, { useState, useRef, useEffect, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Loader2,
  Image as ImageIcon,
  Send,
  RotateCcw,
  Maximize2,
  Download,
  Info,
  Camera,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  type Identity,
  type ImageModel,
  sendCode,
  login,
  selectIdentity,
  getModels,
  generateImage,
  pollResult,
} from './neodomain';

// --- Types ---

interface PanoramaViewerProps {
  imageUrl: string;
  fov: number;
}

type LoginStep = 'contact' | 'code' | 'selectIdentity';

interface AuthState {
  accessToken: string;
  userId: string;
  nickname: string;
}

// --- PanoramaViewer (unchanged from original) ---

const PanoramaViewer = React.forwardRef<
  { takeScreenshot: () => void },
  PanoramaViewerProps
>(({ imageUrl, fov }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    sphere: THREE.Mesh;
    controls: OrbitControls;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    takeScreenshot: () => {
      if (sceneRef.current) {
        const { renderer } = sceneRef.current;
        const dataURL = renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `panorama-snapshot-${Date.now()}.png`;
        link.click();
      }
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      fov,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000,
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(imageUrl);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    camera.position.set(0, 0, 0.1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.rotateSpeed = -0.5;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    sceneRef.current = { scene, camera, renderer, sphere, controls };

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      const { camera, renderer } = sceneRef.current;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.camera.fov = fov;
      sceneRef.current.camera.updateProjectionMatrix();
    }
  }, [fov]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10"
    />
  );
});

// --- Login Screen ---

function LoginScreen({ onLoggedIn }: { onLoggedIn: (auth: AuthState) => void }) {
  const [step, setStep] = useState<LoginStep>('contact');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    if (!contact.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await sendCode(contact.trim());
      setStep('code');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await login(contact.trim(), code.trim());
      const { needSelectIdentity, identities: ids } = res.data;

      if (needSelectIdentity && ids.length > 1) {
        setIdentities(ids);
        setStep('selectIdentity');
      } else {
        // Auto-select the only identity
        const chosen = ids[0];
        const selRes = await selectIdentity(chosen.userId, contact.trim());
        onLoggedIn({
          accessToken: selRes.data.authorization,
          userId: selRes.data.userId,
          nickname: selRes.data.nickname,
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectIdentity = async (identity: Identity) => {
    setLoading(true);
    setError(null);
    try {
      const res = await selectIdentity(identity.userId, contact.trim());
      onLoggedIn({
        accessToken: res.data.authorization,
        userId: res.data.userId,
        nickname: res.data.nickname,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-white/10 rounded-2xl p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <RotateCcw className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
            HDRI Panorama AI
          </h1>
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">登录</h2>
          <p className="text-sm text-zinc-400">使用手机号或邮箱登录</p>
        </div>

        {step === 'contact' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">手机号 / 邮箱</label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                placeholder="输入手机号或邮箱"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-600"
              />
            </div>
            <button
              onClick={handleSendCode}
              disabled={loading || !contact.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              发送验证码
            </button>
          </div>
        )}

        {step === 'code' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">验证码</label>
              <p className="text-xs text-zinc-500">验证码已发送至 {contact}</p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="输入验证码"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-600"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setStep('contact'); setCode(''); setError(null); }}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-medium transition-all"
              >
                返回
              </button>
              <button
                onClick={handleLogin}
                disabled={loading || !code.trim()}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                登录
              </button>
            </div>
          </div>
        )}

        {step === 'selectIdentity' && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">请选择要登录的身份</p>
            <div className="space-y-3">
              {identities.map((identity) => (
                <button
                  key={identity.userId}
                  onClick={() => handleSelectIdentity(identity)}
                  disabled={loading}
                  className="w-full flex items-center gap-4 p-4 bg-black/30 hover:bg-white/5 border border-white/10 hover:border-indigo-500/40 rounded-xl transition-all text-left"
                >
                  {identity.avatar ? (
                    <img
                      src={identity.avatar}
                      alt={identity.nickname}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg">
                      {identity.nickname?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{identity.nickname}</p>
                    <p className="text-xs text-zinc-500">{identity.userType}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs leading-relaxed">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main App ---

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    try {
      const stored = localStorage.getItem('neo_auth');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [models, setModels] = useState<ImageModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [modelsLoading, setModelsLoading] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [customTexture, setCustomTexture] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(75);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const customTextureInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<{ takeScreenshot: () => void }>(null);

  // Persist auth to localStorage and fetch models when auth changes
  useEffect(() => {
    if (auth) {
      localStorage.setItem('neo_auth', JSON.stringify(auth));
      fetchModels(auth);
    } else {
      localStorage.removeItem('neo_auth');
    }
  }, [auth]);

  // Screenshot shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        viewerRef.current?.takeScreenshot();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchModels = async (authState: AuthState) => {
    setModelsLoading(true);
    try {
      const list = await getModels(authState.accessToken, authState.userId);
      setModels(list);
      if (list.length > 0) {
        setSelectedModel((prev) => (prev && list.find((m) => m.model_name === prev)) ? prev : list[0].model_name);
      }
    } catch (err: any) {
      console.error('Failed to load models:', err);
    } finally {
      setModelsLoading(false);
    }
  };

  const handleLoggedIn = (authState: AuthState) => {
    setAuth(authState);
  };

  const handleLogout = () => {
    setAuth(null);
    setModels([]);
    setGeneratedImage(null);
    setCustomTexture(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setReferenceImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCustomTextureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCustomTexture(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const generatePanorama = async () => {
    if (!prompt.trim() || !auth) return;

    setIsGenerating(true);
    setError(null);
    setCustomTexture(null);
    setGeneratingStatus('Submitting...');

    try {
      // Pick the widest aspect ratio supported by the selected model
      const modelInfo = models.find((m) => m.model_name === selectedModel);
      const WIDE_PREFERENCE = ['4:1', '21:9', '16:9', '3:2', '4:3', '1:1'];
      const bestRatio = WIDE_PREFERENCE.find(
        (r) => modelInfo?.supported_aspect_ratios?.includes(r)
      ) ?? '16:9';

      const fullPrompt = `Create a high-quality seamless equirectangular 360-degree panorama HDRI environment map. ${prompt.trim()}`;

      const genRes = await generateImage(auth.accessToken, {
        prompt: fullPrompt,
        modelName: selectedModel,
        aspectRatio: bestRatio,
        numImages: '1',
        outputFormat: 'jpeg',
        syncMode: false,
        size: modelInfo?.supported_sizes?.includes('2K') ? '2K' : (modelInfo?.supported_sizes?.[0] ?? '2K'),
      });

      const taskCode = genRes.data.task_code;
      setGeneratingStatus('Generating...');

      const result = await pollResult(auth.accessToken, taskCode);

      if (result.image_urls && result.image_urls.length > 0) {
        setGeneratedImage(result.image_urls[0]);
      } else {
        throw new Error('No image URLs returned from server.');
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || 'Failed to generate panorama.');
    } finally {
      setIsGenerating(false);
      setGeneratingStatus('');
    }
  };

  // Show login screen if not authenticated
  if (!auth) {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }

  const activeImageUrl = customTexture || generatedImage;

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
              HDRI Panorama AI
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/10">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              {auth.nickname}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors text-xs"
              title="退出登录"
            >
              <LogOut className="w-3.5 h-3.5" />
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-6 backdrop-blur-sm">
            {/* Model selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <ChevronDown className="w-4 h-4" />
                模型
              </label>
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={modelsLoading || models.length === 0}
                  className="w-full appearance-none bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all pr-8 cursor-pointer disabled:opacity-50"
                >
                  {models.length === 0 ? (
                    <option value={selectedModel}>{modelsLoading ? '加载中...' : selectedModel}</option>
                  ) : (
                    models.map((m) => (
                      <option key={m.model_name} value={m.model_name}>
                        {m.model_display_name || m.model_name}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              </div>
            </div>

            {/* Prompt input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Info className="w-4 h-4" />
                描述你的环境
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., A futuristic cyberpunk city at night with neon lights and rainy streets, cinematic lighting..."
                className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all resize-none placeholder:text-zinc-600"
              />
            </div>

            {/* Reference image upload */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                参考图片（可选）
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`relative group cursor-pointer border-2 border-dashed rounded-xl transition-all duration-300 flex flex-col items-center justify-center gap-2 overflow-hidden
                  ${referenceImage ? 'border-indigo-500/50 h-48' : 'border-white/10 hover:border-white/20 h-32 bg-white/[0.02]'}`}
              >
                {referenceImage ? (
                  <>
                    <img
                      src={referenceImage}
                      alt="Reference"
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs font-medium bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-md">
                        更换图片
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-5 h-5 text-zinc-500" />
                    </div>
                    <span className="text-xs text-zinc-500">点击上传参考图片</span>
                  </>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  className="hidden"
                  accept="image/*"
                />
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={generatePanorama}
              disabled={isGenerating || !prompt.trim()}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl
                ${isGenerating || !prompt.trim()
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 active:scale-[0.98]'}`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {generatingStatus || 'Generating...'}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  生成全景图
                </>
              )}
            </button>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs leading-relaxed">
                {error}
              </div>
            )}
          </section>

          <section className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-indigo-300 mb-2">提示</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              为获得最佳效果，请使用描述性关键词，如"体积光照"、"无缝纹理"、"电影感光线"等。
            </p>
          </section>
        </div>

        {/* 3D Viewport Area */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="relative flex-1 aspect-video lg:aspect-auto lg:h-[calc(100vh-8rem)] min-h-[400px]">
            {/* Overlay Controls */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10 z-10">
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">3D Preview</h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">Zoom</span>
                  <input
                    type="range"
                    min="20"
                    max="120"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-24 accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => viewerRef.current?.takeScreenshot()}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
                    title="Take Snapshot (Space)"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => customTextureInputRef.current?.click()}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
                    title="Upload Custom Texture"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                  <input
                    type="file"
                    ref={customTextureInputRef}
                    onChange={handleCustomTextureUpload}
                    className="hidden"
                    accept="image/*"
                  />
                  {activeImageUrl && (
                    <a
                      href={activeImageUrl}
                      download="panorama.jpg"
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
                      title="Download Image"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {activeImageUrl ? (
                <motion.div
                  key="viewer"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="w-full h-full"
                >
                  <PanoramaViewer imageUrl={activeImageUrl} fov={zoom} ref={viewerRef} />
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full h-full bg-zinc-900/30 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-4 text-zinc-500"
                >
                  {isGenerating ? (
                    <div className="flex flex-col items-center gap-6">
                      <div className="relative">
                        <div className="w-20 h-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 border-4 border-purple-500/20 border-b-purple-500 rounded-full animate-spin-slow" />
                        </div>
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-lg font-medium text-zinc-300">
                          {generatingStatus || 'Generating...'}
                        </p>
                        <p className="text-sm text-zinc-500">This may take up to a few minutes</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                        <Maximize2 className="w-8 h-8 opacity-20" />
                      </div>
                      <p className="text-sm">输入提示词生成你的第一个 360° 全景图</p>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation hint */}
            {activeImageUrl && !isGenerating && (
              <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end pointer-events-none">
                <div className="bg-black/40 backdrop-blur-md border border-white/10 p-3 rounded-xl pointer-events-auto">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">
                    Navigation
                  </p>
                  <div className="flex gap-4 text-xs text-zinc-300">
                    <span className="flex items-center gap-1.5">
                      <div className="w-1 h-1 bg-indigo-500 rounded-full" /> Drag to rotate
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-1 h-1 bg-indigo-500 rounded-full" /> Scroll to zoom
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes spin-slow {
            from { transform: rotate(0deg); }
            to { transform: rotate(-360deg); }
          }
          .animate-spin-slow {
            animation: spin-slow 3s linear infinite;
          }
        `,
      }} />
    </div>
  );
}
