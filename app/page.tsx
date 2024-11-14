"use client";
import ClassFilter from './components/ClassFilter';
import Header from './components/Header';
import SearchForm from './components/SearchForm';
import ResultsDisplay from './components/ResultsDisplay';

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import videojs from 'video.js';
import type VideoJsPlayer from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import Layout from './layout';
import './styles.css';
import { track } from '@vercel/analytics';
import Head from 'next/head';

// Components
import { PhotoFrameIcon, MagnifyingGlassIcon, QuestionMarkCircleIcon } from './components/Icons';
import Footer from './components/Footer';
import { handleFileUpload } from './components/FileUploadHandler';

// Handles Python backend API URL based on the environment
// Handles Python backend API URL based on the environment
const API_URL = (() => {
  switch (process.env.NEXT_PUBLIC_VERCEL_ENV) {
    case "development":
      return process.env.NEXT_PUBLIC_DEVELOPMENT_URL || 'http://localhost:8000';
    case "production":
      return `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || ''}`;
    default:
      return "http://localhost:8000";
  }
})();

interface Result {
  score: number;
  metadata: {
    class: string;
    date_added: string;
    s3_file_name: string;
    s3_file_path: string;
    s3_presigned_url: string;
    file_type: 'image' | 'video' | 'text';
    start_offset_sec: number;
    end_offset_sec: number;
    interval_sec: number;
    segment: number;
  };
}

export default function Home() {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<Result[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [dragging, setDragging] = useState<boolean>(false);
  const [totalVectors, setTotalVectors] = useState<number | null>(null);
  const [isSearchComplete, setIsSearchComplete] = useState<boolean>(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [searchType, setSearchType] = useState<'text' | 'image' | 'video' | null>(null);
  const [isInputEmpty, setIsInputEmpty] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClass(e.target.value);
  };
  const filteredResults = selectedClass
  ? results.filter(result => result.metadata.class === selectedClass)
  : results;
  const suggestions = [
    "red coke can",
    "green plastic",
    "cardboard"
  ];
  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setIsInputEmpty(false);
    setShowSuggestions(false);
  };

  const clearResults = () => {
    setQuery('');
    setResults([]);
    setIsInputEmpty(true);
    setIsSearchComplete(false);
    setSearchTime(null);
    setSearchType(null);
    setErrorMessage(null);
  };

  const playersRef = useRef<{ [key: string]: VideoJsPlayer }>({});

  const VerticalDivider = () => (
    <div className="h-6 w-px bg-gray-200"></div>
  );

  useEffect(() => {
    let scrollTracked = false;
    const handleScroll = () => {
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      if (scrollPercentage > 50 && !scrollTracked) {
        track('scroll_depth', { depth: '50%' });
        scrollTracked = true;
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const pageViewData = {
      timestamp: new Date().toISOString(),
      screenSize: `${window.screen.width}x${window.screen.height}`,
      deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      browserName: navigator.userAgent,
      referrer: document.referrer,
      loadTime: performance.now(),
      language: navigator.language,
      totalVectors: totalVectors,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
    };

    track('page_viewed', pageViewData);
  }, [totalVectors]);

  useEffect(() => {

    const fetchTotalVectors = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/index/info`);
        setTotalVectors(response.data.total_vectors);
      } catch (error) {
        console.error('Error fetching total vectors:', error);
      }
    };

    fetchTotalVectors();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(playersRef.current).forEach(player => {
        if (player && typeof player.dispose === 'function') {
          player.dispose();
        }
      });
      playersRef.current = {};
    };
  }, []);

  useEffect(() => {
    results.forEach((result, index) => {
      if (result.metadata.file_type === 'video') {
        const videoId = getVideoId(result, index);
        const videoElement = document.getElementById(videoId) as HTMLVideoElement;

        if (videoElement && !playersRef.current[videoId]) {
          const player = videojs(videoElement, {
            aspectRatio: '1:1',
            fluid: true,
            controls: true,
            muted: true,
            preload: 'auto'
          });

          player.one('ready', () => {
            player.currentTime(result.metadata.start_offset_sec);
          });

          playersRef.current[videoId] = player;
        }
      }
    });

    return () => {
      Object.keys(playersRef.current).forEach(videoId => {
        if (!results.some((result, index) => getVideoId(result, index) === videoId)) {
          playersRef.current[videoId].dispose();
          delete playersRef.current[videoId];
        }
      });
    };
  }, [results]);

  const resetSearchState = () => {
    setResults([]);
    setIsSearchComplete(false);
    setSearchTime(null);
    setSearchType(null);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isInputEmpty) return;

    setShowSuggestions(false);

    resetSearchState();

    setIsSearching(true);
    setIsSearchComplete(false);
    setSearchTime(null);
    setSearchType('text');
    setErrorMessage(null);
    setIsLoadingResults(true);
    const startTime = Date.now();
    try {
      const response = await axios.post(`${API_URL}/api/search/text`, { query });
      setResults(response.data.results);
      const endTime = Date.now();
      setSearchTime(endTime - startTime);
      setIsSearchComplete(true);
      track('search_results', {
        searchType,
        query,
        searchTime
      });
    } catch (error) {
      console.error('Error during text search:', error);
      if (axios.isAxiosError(error) && error.response) {
        setErrorMessage(`Oops! ${error.response.data.detail || 'An unexpected error occurred'}`);
      } else {
        setErrorMessage('Oops! An unexpected error occurred. Our engineers have been notified.');
      }
    } finally {
      setIsSearching(false);
      setIsLoadingResults(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsInputEmpty(value.trim() === '');
    setShowSuggestions(value.trim() !== '');
  };

  const handleFileUploadWrapper = async (file: File) => {
    resetSearchState();
    await handleFileUpload(file, {
      API_URL,
      setSearchType,
      setErrorMessage,
      setIsUploading,
      setIsSearchComplete,
      setSearchTime,
      setIsLoadingResults,
      setResults,
      setQuery,
      setIsInputEmpty,
      setIsSearching
    });
  };

  const handleFocus = () => {
    setShowSuggestions(true);
  };


  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      track('file_selected');
      await handleFileUploadWrapper(e.target.files[0]);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      track('file_dropped');
      await handleFileUploadWrapper(e.dataTransfer.files[0]);
    }
  };

  const getScoreLabel = (score: number) => {
    return { score: score.toFixed(4) };
  };

  const getVideoId = (result: Result, index: number) => `video-${index}-${result.metadata.s3_file_path}`;

  return (
    <Layout>
      <Head>
        <title>Universal Database of Images</title>
      </Head>
      <div
        className={`flex flex-col items-center justify-start min-h-screen bg-gray-100 ${dragging ? 'border-4 border-dashed border-blue-500' : ''
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ fontFamily: "'Inter', 'Helvetica', 'Arial', sans-serif" }}
      >
        <div className="max-w-6xl w-full px-4 md:px-0 mt-12">
          <Header /> 
          <div className="max-w-xl mx-auto relative">
          <SearchForm
              query={query}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              handleFileChange={handleFileChange}
              isInputEmpty={isInputEmpty}
              isUploading={isUploading}
              isSearching={isSearching}
              clearResults={clearResults}
              suggestions={suggestions} // Pass full suggestions list
              handleSuggestionClick={handleSuggestionClick}
              showSuggestions={showSuggestions} // Pass state to control visibility
              handleFocus={handleFocus} // Add focus handler
            />
            <div className="mt-4">
              <ClassFilter
                selectedClass={selectedClass}
                onClassChange={handleClassChange}
                availableClasses={Array.from(new Set(results.map(result => result.metadata.class)))}
              />
            </div>

            {errorMessage && (
              <div className="w-full mt-4 text-red-500 text-center">
                {errorMessage}
              </div>
            )}
            {(isUploading || isSearching) && (
              <div className="w-full mt-8 flex items-center justify-center">
                <span className="text-gray-500 pulse">
                  {isUploading ? "Uploading, embedding, and searching..." : "Searching..."}
                </span>
                <div className="ml-3 spinner border-4 border-t-transparent border-indigo-300 rounded-full w-6 h-6 animate-spin"></div>
              </div>
            )}
          </div>
          <div>
            {isSearchComplete && searchTime !== null && totalVectors !== null && (
              <div className="ml-1 mt-6 mb-2 flex items-center text-left text-gray-700">
                <p>
                  Searched {totalVectors.toLocaleString()} objects
                  {searchType === 'text' && <> for <strong className="text-indigo-800">{query}</strong></>}
                  {searchType === 'image' && <> for <strong className="text-indigo-800">your image</strong></>}
                  {searchType === 'video' && <> for <strong className="text-indigo-800">your video</strong></>}
                </p>
                <button
                  type="button"
                  onClick={clearResults}
                  className="text-gray-400 hover:text-gray-500 mb-0.4 ml-2 focus:outline-none"
                  disabled={isUploading || isSearching}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </button>
              </div>
            )}
            <ResultsDisplay
              isLoadingResults={isLoadingResults}
              results={filteredResults}
              getScoreLabel={getScoreLabel}
              getVideoId={getVideoId}
            />

          </div>
        </div>
        <Footer />
      </div>
    </Layout>
  );
}
