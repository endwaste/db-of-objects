import { useState } from "react";
import UploadModal from "./UploadModal";

const ParentComponent = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);

    const openModal = () => setIsModalOpen(true);
    const closeModal = () => setIsModalOpen(false);

    return (
        <div>
            <button onClick={openModal} className="px-4 py-2 bg-blue-500 text-white rounded">
                Open Upload Modal
            </button>

            <UploadModal
                isOpen={isModalOpen}
                onClose={closeModal}
                apiUrl="/api/upload" // Example API URL
                setUploadStatus={setUploadStatus} // Pass the state setter
            />

            {/* Display Upload Status */}
            {uploadStatus && (
                <div
                    className={`mt-4 p-2 rounded ${uploadStatus.includes("successful")
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                >
                    {uploadStatus}
                </div>
            )}
        </div>
    );
};

export default ParentComponent;
