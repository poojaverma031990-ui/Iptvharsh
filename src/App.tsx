import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Tv, Play, Pause, ExternalLink, Loader2, Search, Heart,
  Settings, RotateCcw, Volume2, VolumeX, Maximize, RefreshCw,
  ChevronRight, Compass, Sun, Moon, Info, ShieldAlert, Check,
  Sliders, Plus, Trash2, ListMusic, Grid, List, Zap, CheckCircle2,
  X, HelpCircle, MonitorPlay, Sparkles, ChevronDown, CheckCircle
} from 'lucide-react';
import Hls from 'hls.js';
import { IPTVChannel } from './types';

// Predefined Curated / Working High-Quality Playlists (Global, India, News, Sports, Entertainment)
interface PlaylistPreset {
  name: string;
  url: string;
  category: string;
}

const PLAYLIST_PRESETS: PlaylistPreset[] = [
  { name: 'India Live (iptv-org)', url: 'https://iptv-org.github.io/iptv/countries/in.m3u', category: 'India' },
  { name: 'Global News Channels', url: 'https://iptv-org.github.io/iptv/categories/news.m3u', category: 'News' },
  { name: 'Global Sports Channels', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u', category: 'Sports' },
  { name: 'Global Movies & Entertainment', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u', category: 'Movies' },
  { name: 'Global Music', url: 'https://iptv-org.github.io/iptv/categories/music.m3u', category: 'Music' },
  { name: 'USA Live (iptv-org)', url: 'https://iptv-org.github.io/iptv/countries/us.m3u', category: 'USA' },
  { name: 'UK Live (iptv-org)', url: 'https://iptv-org.github.io/iptv/countries/gb.m3u', category: 'UK' },
  { name: 'Canada Live (iptv-org)', url: 'https://iptv-org.github.io/iptv/countries/ca.m3u', category: 'Canada' },
  { name: 'Sample/Testing Stream', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', category: 'Test' }
];

// Enhanced M3U Parser to extract tvg-logo, group-title, tvg-id, etc.
const parseM3U = (data: string): IPTVChannel[] => {
  const lines = data.split('\n');
  const channels: IPTVChannel[] = [];
  let currentChannel: Partial<IPTVChannel> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      // Extract tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      const logo = logoMatch ? logoMatch[1] : undefined;

      // Extract group-title
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      const group = groupMatch ? groupMatch[1] : undefined;

      // Extract tvg-id or id
      const idMatch = line.match(/tvg-id="([^"]+)"/i);
      const id = idMatch ? idMatch[1] : undefined;

      // Extract channel name
      const nameMatch = line.match(/,(.*)$/);
      const name = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';

      currentChannel = {
        name,
        logo,
        group: group || 'General',
        id: id || Math.random().toString(36).substring(7),
      };
    } else if (line.startsWith('http')) {
      currentChannel.url = line;
      if (currentChannel.name) {
        channels.push(currentChannel as IPTVChannel);
      }
      currentChannel = {};
    }
  }

  // If parsed list is empty but we have lines, let's fallback to checking lines directly
  if (channels.length === 0) {
    // If it's a direct HLS url and not a full M3U
    if (data.trim().startsWith('http') && (data.includes('.m3u8') || data.includes('.mp4'))) {
      channels.push({
        name: 'Direct Stream',
        url: data.trim(),
        group: 'Direct',
        id: 'direct-stream'
      });
    }
  }

  return channels;
};

export default function App() {
  // Playlist & Channel State
  const [selectedPreset, setSelectedPreset] = useState<PlaylistPreset>(PLAYLIST_PRESETS[0]);
  const [customPlaylists, setCustomPlaylists] = useState<PlaylistPreset[]>([]);
  const [channels, setChannels] = useState<IPTVChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');

  // Custom Playlist Modal State
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  // Player Navigation & View States
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [activeChannel, setActiveChannel] = useState<IPTVChannel | null>(null);
  const [favorites, setFavorites] = useState<IPTVChannel[]>([]);
  const [activeTab, setActiveTab] = useState<'channels' | 'presets' | 'favorites' | 'settings'>('channels');
  
  // Layout & Styling Mode
  const [isLightMode, setIsLightMode] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Video Controller States
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isPipAvailable, setIsPipAvailable] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load Custom Playlists & Favorites from LocalStorage on mount
  useEffect(() => {
    try {
      const storedFavs = localStorage.getItem('iptv_favorites');
      if (storedFavs) setFavorites(JSON.parse(storedFavs));

      const storedCustom = localStorage.getItem('iptv_custom_playlists');
      if (storedCustom) setCustomPlaylists(JSON.parse(storedCustom));

      const storedTheme = localStorage.getItem('iptv_theme');
      if (storedTheme) setIsLightMode(storedTheme === 'light');
    } catch (e) {
      console.error('Failed to load localStorage items', e);
    }

    // Check if Picture-in-Picture is supported
    if (typeof document !== 'undefined' && 'pictureInPictureEnabled' in document) {
      setIsPipAvailable(true);
    }
  }, []);

  // Fetch Channels
  const fetchChannels = useCallback(async (playlistUrl: string) => {
    setLoading(true);
    setLoadingError(null);
    try {
      // In a real browser, CORS can block directly fetching github/external m3u lists.
      // We will offer a fallback or dynamic loading.
      const response = await fetch(playlistUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      const data = await response.text();
      const parsed = parseM3U(data);
      setChannels(parsed);
      setSelectedGroup('All');
      setSearchQuery('');
      setFocusedIndex(0);

      if (parsed.length > 0) {
        setActiveChannel(parsed[0]);
      } else {
        setActiveChannel(null);
        setLoadingError('No channels found in this playlist.');
      }
    } catch (error: any) {
      console.error('Failed to fetch channels:', error);
      setLoadingError(error.message || 'Network error fetching playlist. Make sure the link is correct and permits CORS.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on preset/custom selection change
  useEffect(() => {
    if (selectedPreset) {
      fetchChannels(selectedPreset.url);
    }
  }, [selectedPreset, fetchChannels]);

  // Video Player Logic & Recovery
  const initPlayer = useCallback(() => {
    if (!activeChannel || !videoRef.current) return;

    setPlayerError(null);
    setIsPlaying(true);

    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    // Configure HLS options for fast loading and mobile optimization
    const hlsConfig = {
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: 10,
      maxMaxBufferLength: 20,
    };

    if (Hls.isSupported()) {
      const hls = new Hls(hlsConfig);
      hls.loadSource(activeChannel.url);
      hls.attachMedia(videoRef.current);
      hlsRef.current = hls;

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS.js error event:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Fatal network error encountered, trying to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Fatal media error encountered, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
              setPlayerError('Stream connection failed. Try another channel.');
              hls.destroy();
              break;
          }
        }
      });

      videoRef.current.play().catch(e => {
        console.log("Autoplay blocked or failed", e);
        setIsPlaying(false);
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Native iOS HLS support
      videoRef.current.src = activeChannel.url;
      videoRef.current.play().catch(e => {
        console.log("Autoplay blocked or failed", e);
        setIsPlaying(false);
      });
    } else {
      setPlayerError('HLS streaming is not supported on this device.');
    }
  }, [activeChannel]);

  useEffect(() => {
    initPlayer();
  }, [initPlayer]);

  // Handle Playback Actions
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(e => console.log(e));
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = parseFloat(e.target.value);
    setVolume(nextVolume);
    if (videoRef.current) {
      videoRef.current.volume = nextVolume;
      videoRef.current.muted = nextVolume === 0;
      setIsMuted(nextVolume === 0);
    }
  };

  const triggerPip = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.error('PiP error:', e);
    }
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    const element = videoRef.current.parentElement;
    if (!element) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      element.requestFullscreen().catch(e => {
        console.error('Fullscreen request failed:', e);
      });
    }
  };

  // Keyboard Navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return; // Ignore when typing

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(0, prev - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(channels.length - 1, prev + 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (channels[focusedIndex]) {
          setActiveChannel(channels[focusedIndex]);
        }
        break;
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        toggleMute();
        break;
    }
  }, [channels, focusedIndex, isPlaying, isMuted]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle custom playlist creation
  const handleAddCustomPlaylist = () => {
    if (!customName || !customUrl) {
      alert('Please fill out all fields.');
      return;
    }
    const newPlaylist: PlaylistPreset = {
      name: customName,
      url: customUrl.trim(),
      category: 'Custom'
    };
    const updated = [newPlaylist, ...customPlaylists];
    setCustomPlaylists(updated);
    localStorage.setItem('iptv_custom_playlists', JSON.stringify(updated));
    setSelectedPreset(newPlaylist);
    setCustomName('');
    setCustomUrl('');
    setShowCustomModal(false);
  };

  // Delete custom playlist
  const handleDeleteCustomPlaylist = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    const updated = customPlaylists.filter(p => p.url !== url);
    setCustomPlaylists(updated);
    localStorage.setItem('iptv_custom_playlists', JSON.stringify(updated));
    if (selectedPreset.url === url) {
      setSelectedPreset(PLAYLIST_PRESETS[0]);
    }
  };

  // Star / Favorite Management
  const isFavorite = (chan: IPTVChannel) => {
    return favorites.some(f => f.url === chan.url);
  };

  const toggleFavorite = (chan: IPTVChannel, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let updated: IPTVChannel[] = [];
    if (isFavorite(chan)) {
      updated = favorites.filter(f => f.url !== chan.url);
    } else {
      updated = [...favorites, chan];
    }
    setFavorites(updated);
    localStorage.setItem('iptv_favorites', JSON.stringify(updated));
  };

  // Theme Management
  const toggleTheme = () => {
    const nextTheme = !isLightMode;
    setIsLightMode(nextTheme);
    localStorage.setItem('iptv_theme', nextTheme ? 'light' : 'dark');
  };

  // Mobile Auto Hide Video Controls
  const handleVideoTouch = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4000);
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  // Filter & Search Logic
  const filteredChannels = channels.filter(channel => {
    const matchesSearch = channel.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGroup = selectedGroup === 'All' || channel.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  // Extract unique category groups from loaded channel list
  const groups = ['All', ...Array.from(new Set(channels.map(c => c.group || 'General')))].slice(0, 30);

  // Auto-scroll side navigation or list to focused items (handling grid wrapper safely)
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('.group\\/item');
      const focusedElement = items[focusedIndex] as HTMLElement;
      if (focusedElement) {
        focusedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }
  }, [focusedIndex]);

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden transition-colors duration-300 ${
      isLightMode
        ? 'bg-slate-50 text-slate-800'
        : 'bg-[#0a0a0c] text-zinc-100'
    }`}>
      {/* Top Banner / Navigation for Premium feel */}
      <header className={`px-4 py-3 flex items-center justify-between border-b shrink-0 transition-colors duration-200 ${
        isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-zinc-950 border-zinc-900 shadow-lg'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white shadow-md">
            <Tv className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight flex items-center gap-1.5">
              <span>STREAM</span>
              <span className="text-rose-500">VIBE</span>
              <span className="text-[10px] bg-rose-500/15 text-rose-500 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold">PREMIUM</span>
            </h1>
          </div>
        </div>

        {/* Action Buttons & Theme Toggler */}
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl transition-all duration-200 active:scale-95 ${
              isLightMode
                ? 'bg-slate-100 text-amber-600 hover:bg-slate-200'
                : 'bg-zinc-900 text-amber-400 hover:bg-zinc-800'
            }`}
            title="Toggle Theme"
          >
            {isLightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowCustomModal(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white text-xs font-bold px-3 py-2.5 rounded-xl shadow-lg shadow-rose-500/25 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">ADD PLAYLIST</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout (Desktop Side-by-Side, Mobile Stacked with sticky Top Video Player) */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden relative">
        
        {/* VIDEO PLAYER COMPONENT (Top on mobile, Right on Desktop) */}
        <div className="w-full lg:w-3/5 lg:h-full shrink-0 flex flex-col bg-black relative group/player">

          <div
            className="relative w-full aspect-video lg:aspect-auto lg:flex-1 bg-black flex items-center justify-center overflow-hidden"
            onClick={handleVideoTouch}
          >
            {/* Dark Layer with Brightness adjust */}
            <div
              className="absolute inset-0 pointer-events-none z-10 bg-black transition-opacity"
              style={{ opacity: 1 - brightness }}
            />

            <video
              ref={videoRef}
              className="w-full h-full max-h-full object-contain"
              playsInline
              onClick={togglePlay}
            />

            {/* In-player Error message overlay */}
            {playerError && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/90 text-center p-6 space-y-4">
                <ShieldAlert className="w-12 h-12 text-rose-500 animate-bounce" />
                <div>
                  <h3 className="text-white font-bold text-lg">Playback Error</h3>
                  <p className="text-zinc-400 text-sm max-w-sm mt-1">{playerError}</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={initPlayer}
                    className="bg-white text-black font-bold text-xs px-4 py-2 rounded-lg hover:bg-gray-200 active:scale-95 transition"
                  >
                    Retry Connection
                  </button>
                  {activeChannel && (
                    <button
                      onClick={() => window.open(`vlc://${activeChannel.url}`, '_blank')}
                      className="bg-zinc-800 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-zinc-700 active:scale-95 transition flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Try VLC Player
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Custom On-Screen Media Controls Overlay */}
            <div className={`absolute inset-0 z-20 flex flex-col justify-between p-3 bg-gradient-to-t from-black/80 via-transparent to-black/50 transition-all duration-300 ${
              showControls ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
            }`}>

              {/* TOP INFO ROW */}
              <div className="flex items-center justify-between">
                <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1 text-white text-xs max-w-[70%] flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span className="font-semibold truncate">{activeChannel?.name || 'No Channel Loaded'}</span>
                </div>

                <div className="flex space-x-1">
                  {activeChannel && (
                    <button
                      onClick={(e) => toggleFavorite(activeChannel, e)}
                      className={`p-2 rounded-lg backdrop-blur-md border border-white/10 transition active:scale-95 ${
                        isFavorite(activeChannel) ? 'bg-rose-500/80 text-white' : 'bg-black/60 text-white hover:bg-white/10'
                      }`}
                    >
                      <Heart className="w-4 h-4" fill={isFavorite(activeChannel) ? 'currentColor' : 'none'} />
                    </button>
                  )}
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white hover:bg-white/10 transition active:scale-95"
                  >
                    <Maximize className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* CENTER PLAY BUTTON ON TAP */}
              <div className="flex items-center justify-center">
                <button
                  onClick={togglePlay}
                  className="p-4 rounded-full bg-rose-500/90 text-white hover:bg-rose-500 shadow-lg shadow-rose-500/40 transform hover:scale-110 active:scale-95 transition duration-200"
                >
                  {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-0.5" />}
                </button>
              </div>

              {/* BOTTOM CONTROL PANEL */}
              <div className="space-y-2 bg-black/70 backdrop-blur-lg border border-white/10 p-2 rounded-xl">

                {/* Sliders Area (Volume & Brightness) */}
                <div className="flex items-center justify-between text-[11px] text-zinc-300 gap-4">
                  {/* Volume Slider */}
                  <div className="flex items-center space-x-2 flex-1">
                    <button onClick={toggleMute} className="text-white hover:text-rose-400">
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-full accent-rose-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Brightness Slider */}
                  <div className="flex items-center space-x-2 flex-1">
                    <Sun className="w-4 h-4 text-zinc-400" />
                    <input
                      type="range"
                      min="0.2"
                      max="1.5"
                      step="0.05"
                      value={brightness}
                      onChange={(e) => setBrightness(parseFloat(e.target.value))}
                      className="w-full accent-rose-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Quick actions strip */}
                <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-white/5">
                  <div className="flex space-x-3">
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-extrabold px-1.5 py-0.5 rounded uppercase">LIVE</span>
                    <span>1080P • HLS</span>
                  </div>

                  <div className="flex space-x-2">
                    {isPipAvailable && (
                      <button
                        onClick={triggerPip}
                        className="hover:text-white transition flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-md"
                      >
                        <MonitorPlay className="w-3 h-3" /> PiP
                      </button>
                    )}
                    <button
                      onClick={initPlayer}
                      className="hover:text-rose-400 transition flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-md"
                    >
                      <RefreshCw className="w-3 h-3" /> Reload
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>

          {/* Under player metadata section (Desktop only or expanded details) */}
          <div className={`p-4 border-t hidden lg:block transition-colors duration-200 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-zinc-950 border-zinc-900'
          }`}>
            {activeChannel ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">{activeChannel.group || 'GENERAL'}</span>
                    <h2 className="text-2xl font-black mt-0.5">{activeChannel.name}</h2>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => toggleFavorite(activeChannel)}
                      className={`flex items-center space-x-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                        isFavorite(activeChannel)
                          ? 'bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-500/20'
                          : isLightMode ? 'border-slate-200 hover:bg-slate-50' : 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      <Heart className="w-3.5 h-3.5" fill={isFavorite(activeChannel) ? 'currentColor' : 'none'} />
                      <span>{isFavorite(activeChannel) ? 'FAVORITED' : 'ADD FAVORITE'}</span>
                    </button>
                    <button
                      onClick={() => window.open(`vlc://${activeChannel.url}`, '_blank')}
                      className={`flex items-center space-x-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                        isLightMode
                          ? 'border-slate-200 hover:bg-slate-50 text-slate-600'
                          : 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>VLC PLAYER</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl flex items-center justify-between text-xs transition-colors duration-200 bg-zinc-100/50 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-400">
                  <span className="truncate max-w-[80%] font-mono">Source: {activeChannel.url}</span>
                  <span className="font-extrabold text-emerald-500 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> ONLINE
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-zinc-500 py-6 text-center text-sm">Select a channel from the directory to start streaming.</div>
            )}
          </div>
        </div>

        {/* SIDEBAR CONTAINER (Left side desktop, Bottom scrollable/tabs mobile) */}
        <div className={`flex-1 flex flex-col h-full overflow-hidden transition-colors duration-200 ${
          isLightMode ? 'bg-white border-r border-slate-200' : 'bg-zinc-950 border-r border-zinc-900'
        }`}>

          {/* SEARCH, FILTER & GROUPS COMPONENT */}
          <div className={`p-4 space-y-3 shrink-0 border-b transition-colors duration-200 ${
            isLightMode ? 'border-slate-100 bg-slate-50/50' : 'border-zinc-900 bg-zinc-900/20'
          }`}>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search premium channels, streams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 text-sm rounded-xl outline-none focus:ring-2 focus:ring-rose-500/50 transition-all ${
                  isLightMode
                    ? 'bg-white border border-slate-200 placeholder-slate-400 text-slate-800'
                    : 'bg-zinc-900/90 border border-zinc-800 placeholder-zinc-500 text-zinc-100'
                }`}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Groups Slider */}
            {activeTab === 'channels' && groups.length > 1 && (
              <div className="flex space-x-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {groups.map((group) => (
                  <button
                    key={group}
                    onClick={() => setSelectedGroup(group)}
                    className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                      selectedGroup === group
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20 font-bold'
                        : isLightMode
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {group}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TAB CONTENT PANEL */}
          <div className="flex-1 overflow-y-auto" ref={listRef}>

            {/* Tab: Channel Directory */}
            {activeTab === 'channels' && (
              <>
                {loading ? (
                  <div className="flex flex-col h-48 items-center justify-center text-zinc-400 space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
                    <span className="text-xs font-semibold">Configuring stream list, please wait...</span>
                  </div>
                ) : loadingError ? (
                  <div className="p-8 text-center space-y-3">
                    <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
                    <h4 className="font-bold text-sm">Failed to Load Playlist</h4>
                    <p className="text-xs text-zinc-400 max-w-xs mx-auto">{loadingError}</p>
                    <button
                      onClick={() => fetchChannels(selectedPreset.url)}
                      className="text-xs font-extrabold text-rose-500 underline"
                    >
                      Try Again
                    </button>
                  </div>
                ) : filteredChannels.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-xs">
                    No channels matched your search or category filter.
                  </div>
                ) : (
                  <div className={`grid gap-1.5 p-3 ${viewMode === 'grid' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {filteredChannels.map((channel, idx) => {
                      const isActive = activeChannel?.url === channel.url;
                      return (
                        <div
                          key={`${channel.url}-${idx}`}
                          onClick={() => {
                            setFocusedIndex(idx);
                            setActiveChannel(channel);
                          }}
                          className={`group/item flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 relative ${
                            isActive
                              ? 'bg-rose-500/10 border border-rose-500/30'
                              : isLightMode
                                ? 'bg-white hover:bg-slate-50 border border-slate-100'
                                : 'bg-zinc-900/30 hover:bg-zinc-900/70 border border-zinc-900/40'
                          }`}
                        >
                          {/* Channel Logo / Initial */}
                          <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 font-bold overflow-hidden border ${
                            isActive
                              ? 'border-rose-400/40'
                              : isLightMode ? 'border-slate-200' : 'border-zinc-800'
                          }`}>
                            {channel.logo ? (
                              <img
                                src={channel.logo}
                                alt=""
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                className="w-full h-full object-contain"
                              />
                            ) : null}
                            <span className="text-xs uppercase text-zinc-400">{channel.name.substring(0, 2)}</span>
                          </div>

                          {/* Channel Details */}
                          <div className="ml-3 flex-1 min-w-0 pr-6">
                            <span className="text-[10px] uppercase tracking-wider text-rose-500/80 font-bold block truncate">
                              {channel.group || 'General'}
                            </span>
                            <h4 className={`text-xs font-bold truncate transition-colors ${
                              isActive ? 'text-rose-500' : isLightMode ? 'text-slate-800' : 'text-zinc-100'
                            }`}>
                              {channel.name}
                            </h4>
                          </div>

                          {/* Right Play Indicator / Favorite button */}
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1.5 opacity-80 group-hover/item:opacity-100">
                            <button
                              onClick={(e) => toggleFavorite(channel, e)}
                              className={`p-1.5 rounded-lg transition ${
                                isFavorite(channel)
                                  ? 'text-rose-500'
                                  : 'text-zinc-400 hover:text-rose-400'
                              }`}
                            >
                              <Heart className="w-3.5 h-3.5" fill={isFavorite(channel) ? 'currentColor' : 'none'} />
                            </button>
                            {isActive && <Play className="w-3.5 h-3.5 fill-rose-500 text-rose-500 animate-pulse" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Tab: Playlists & Curated Sources */}
            {activeTab === 'presets' && (
              <div className="p-3 space-y-4">
                {/* Custom Playlists */}
                {customPlaylists.length > 0 && (
                  <div>
                    <h3 className="text-xs font-extrabold text-rose-500 uppercase tracking-widest px-1 mb-2">My Playlists</h3>
                    <div className="space-y-1.5">
                      {customPlaylists.map((p, index) => (
                        <div
                          key={index}
                          onClick={() => setSelectedPreset(p)}
                          className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer border transition-all ${
                            selectedPreset.url === p.url
                              ? 'bg-rose-500/10 border-rose-500/30'
                              : isLightMode ? 'bg-white hover:bg-slate-50 border-slate-100' : 'bg-zinc-900/40 border-zinc-900 hover:bg-zinc-900/80'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                              <ListMusic className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold truncate">{p.name}</h4>
                              <p className="text-[10px] text-zinc-500 truncate mt-0.5">{p.url}</p>
                            </div>
                          </div>

                          <button
                            onClick={(e) => handleDeleteCustomPlaylist(e, p.url)}
                            className="p-2 text-zinc-400 hover:text-rose-500 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Built-in Presets */}
                <div>
                  <h3 className="text-xs font-extrabold text-rose-500 uppercase tracking-widest px-1 mb-2 font-mono">Curated Presets</h3>
                  <div className="space-y-1.5">
                    {PLAYLIST_PRESETS.map((p, index) => (
                      <div
                        key={index}
                        onClick={() => setSelectedPreset(p)}
                        className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer border transition-all ${
                          selectedPreset.url === p.url
                            ? 'bg-rose-500/10 border-rose-500/30'
                            : isLightMode ? 'bg-white hover:bg-slate-50 border-slate-100' : 'bg-zinc-900/40 border-zinc-900 hover:bg-zinc-900/80'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                            <Compass className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold truncate">{p.name}</h4>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{p.category} DIRECTORY</p>
                          </div>
                        </div>
                        {selectedPreset.url === p.url && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Favorite Channels */}
            {activeTab === 'favorites' && (
              <div className="p-3">
                {favorites.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <Heart className="w-10 h-10 text-zinc-500 mx-auto" />
                    <h4 className="font-bold text-xs text-zinc-400">No Starred Channels</h4>
                    <p className="text-[11px] text-zinc-500 max-w-[200px] mx-auto">
                      Star your favorite IPTV channels to access them instantly from here!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {favorites.map((channel, idx) => (
                      <div
                        key={`fav-${idx}`}
                        onClick={() => setActiveChannel(channel)}
                        className={`flex items-center p-3.5 rounded-xl cursor-pointer border transition-all duration-200 relative ${
                          activeChannel?.url === channel.url
                            ? 'bg-rose-500/10 border-rose-500/30'
                            : isLightMode ? 'bg-white hover:bg-slate-50 border-slate-100' : 'bg-zinc-900/40 border-zinc-900 hover:bg-zinc-900/80'
                        }`}
                      >
                        {/* Channel Logo / Initial */}
                        <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center font-bold text-xs text-rose-500 shrink-0 overflow-hidden border border-zinc-800">
                          {channel.logo ? (
                            <img src={channel.logo} alt="" className="w-full h-full object-contain" />
                          ) : (
                            channel.name.substring(0, 2)
                          )}
                        </div>

                        {/* Details */}
                        <div className="ml-3 flex-1 min-w-0 pr-6">
                          <h4 className="text-xs font-bold truncate">{channel.name}</h4>
                          <span className="text-[10px] text-zinc-500 uppercase block truncate mt-0.5">
                            {channel.group}
                          </span>
                        </div>

                        {/* Unstar / Remove Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(channel);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-rose-500 hover:scale-105 active:scale-95 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Settings & Manual Input */}
            {activeTab === 'settings' && (
              <div className="p-4 space-y-4 text-xs">

                {/* App Customizations */}
                <div>
                  <h3 className="text-xs font-extrabold text-rose-500 uppercase tracking-widest mb-3">View Customization</h3>
                  <div className={`p-4 rounded-xl space-y-3 border ${
                    isLightMode ? 'bg-slate-50 border-slate-100' : 'bg-zinc-900/40 border-zinc-900'
                  }`}>
                    {/* View mode toggle */}
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-400">Layout Format</span>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => setViewMode('list')}
                          className={`p-1.5 rounded-lg border transition ${
                            viewMode === 'list'
                              ? 'bg-rose-500 border-rose-500 text-white'
                              : isLightMode ? 'border-slate-200' : 'border-zinc-800 text-zinc-400'
                          }`}
                        >
                          <List className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`p-1.5 rounded-lg border transition ${
                            viewMode === 'grid'
                              ? 'bg-rose-500 border-rose-500 text-white'
                              : isLightMode ? 'border-slate-200' : 'border-zinc-800 text-zinc-400'
                          }`}
                        >
                          <Grid className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Preset Selector */}
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-400 font-mono">Current Directory</span>
                      <span className="font-bold text-rose-500 uppercase">{selectedPreset.name}</span>
                    </div>
                  </div>
                </div>

                {/* Mobile optimization note */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  isLightMode ? 'bg-indigo-50/50 border-indigo-100 text-indigo-800' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                }`}>
                  <Sliders className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-xs uppercase tracking-wider mb-1">D-PAD & GESTURE NAVIGATION</h4>
                    <p className="text-[11px] leading-relaxed text-zinc-400">
                      Fully optimized for android smart TV controllers and touch screens. Swipe horizontally to browse categories, use Up/Down key bindings, or simple double-tap gestures to quickly fullscreen.
                    </p>
                  </div>
                </div>

                {/* Disclaimer / Info */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  isLightMode ? 'bg-slate-50 border-slate-100 text-slate-500' : 'bg-zinc-900/20 border-zinc-900 text-zinc-400'
                }`}>
                  <Info className="w-5 h-5 shrink-0 text-zinc-500 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-xs uppercase tracking-wider mb-1 text-rose-500">Disclaimer</h4>
                    <p className="text-[11px] leading-relaxed">
                      StreamVibe does not host any M3U playlists or multimedia files. Channel sources are aggregated from open-source repository channels. Please check local licensing laws before loading custom feeds.
                    </p>
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* BOTTOM PREMIUM TABS BAR */}
          <nav className={`grid grid-cols-4 border-t p-1 shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-zinc-950 border-zinc-900'
          }`}>
            <button
              onClick={() => setActiveTab('channels')}
              className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
                activeTab === 'channels'
                  ? 'text-rose-500 font-bold bg-rose-500/5'
                  : 'text-zinc-500 hover:text-rose-400'
              }`}
            >
              <Tv className="w-4 h-4 mb-1" />
              <span className="text-[10px] font-semibold tracking-wide uppercase">Channels</span>
            </button>

            <button
              onClick={() => setActiveTab('presets')}
              className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
                activeTab === 'presets'
                  ? 'text-rose-500 font-bold bg-rose-500/5'
                  : 'text-zinc-500 hover:text-rose-400'
              }`}
            >
              <Compass className="w-4 h-4 mb-1" />
              <span className="text-[10px] font-semibold tracking-wide uppercase">Discover</span>
            </button>

            <button
              onClick={() => setActiveTab('favorites')}
              className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
                activeTab === 'favorites'
                  ? 'text-rose-500 font-bold bg-rose-500/5'
                  : 'text-zinc-500 hover:text-rose-400'
              }`}
            >
              <Heart className="w-4 h-4 mb-1" />
              <span className="text-[10px] font-semibold tracking-wide uppercase">Favorites</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${
                activeTab === 'settings'
                  ? 'text-rose-500 font-bold bg-rose-500/5'
                  : 'text-zinc-500 hover:text-rose-400'
              }`}
            >
              <Settings className="w-4 h-4 mb-1" />
              <span className="text-[10px] font-semibold tracking-wide uppercase">Settings</span>
            </button>
          </nav>

        </div>

      </div>

      {/* CUSTOM PLAYLIST MODAL POPUP */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className={`w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-2xl transition-all ${
            isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-zinc-950 border-zinc-900 text-zinc-100'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListMusic className="w-5 h-5 text-rose-500" />
                <h3 className="font-black text-base uppercase tracking-wider">Custom Playlist Loader</h3>
              </div>
              <button
                onClick={() => setShowCustomModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-900 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Add your own custom M3U or direct HLS URL list to load and preview custom channel directories.
            </p>

            <div className="space-y-3.5">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Playlist Name</label>
                <input
                  type="text"
                  placeholder="e.g. My Personal Feed"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className={`w-full p-2.5 text-xs rounded-xl border outline-none focus:ring-2 focus:ring-rose-500/30 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
                      : 'bg-zinc-900 border-zinc-850 text-zinc-100 placeholder-zinc-500'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1 font-mono">M3U Playlist URL or Direct HLS Link</label>
                <input
                  type="text"
                  placeholder="https://example.com/playlist.m3u"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className={`w-full p-2.5 text-xs rounded-xl border outline-none focus:ring-2 focus:ring-rose-500/30 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
                      : 'bg-zinc-900 border-zinc-850 text-zinc-100 placeholder-zinc-500'
                  }`}
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setShowCustomModal(false)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition ${
                  isLightMode ? 'bg-slate-100 hover:bg-slate-200' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomPlaylist}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/25 transition active:scale-95"
              >
                Import Playlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
