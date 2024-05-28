import { useEffect, useState } from "react"
import { VerifyEmailModal } from "../layout/navbar/login-menu/verify-email-modal"

function AuthInvalidUser() {
    const [isOpen, setIsModalOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        function handleInvalidEmail(e) {
            if(e?.detail) {
                if(e.detail === "linked_to_another_user") {
                    //setTitle('Invalid Email')
                    //setDescription('Email provided is already linked to another user. Please try again with another email.')
                }
            } 
           
            setIsModalOpen(true)
        }
        document.addEventListener('auth-invalid-email',handleInvalidEmail )
        return function() {
            document.removeEventListener('auth-invalid-email',handleInvalidEmail )
        }
    }, [])
    return <>
    <VerifyEmailModal title={"Email Verification failed"} description={"Your email is either invalid or not available in our directory. Please try again"} isOpen={isOpen} setIsModalOpen={setIsModalOpen}/>
    <style jsx>
        {
            `
            
            
            `
        }
    </style>
    </>
}

export default AuthInvalidUser