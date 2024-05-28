import { useEffect, useState } from "react"
import { VerifyEmailModal } from "../layout/navbar/login-menu/verify-email-modal"

function AuthInvalidUser() {
    const [isOpen, setIsModalOpen] = useState(false);
    const [title, setTitle] = useState('Email Verification failed');
    const [description, setDescription] = useState('');

    useEffect(() => {
        function handleInvalidEmail(e) {
            if(e?.detail) {
                if(e.detail === "linked_to_another_user") {
                    setTitle('Email Verification')
                    setDescription('The email you provided is already linked to another account. If this is your email id, then login directly with the email id and then connect your social account in settings.')
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
    <VerifyEmailModal title={title} description={description} isOpen={isOpen} setIsModalOpen={setIsModalOpen}/>
    <style jsx>
        {
            `
            
            
            `
        }
    </style>
    </>
}

export default AuthInvalidUser