import { useEffect, useState } from "react"
import { VerifyEmailModal } from "../layout/navbar/login-menu/verify-email-modal"

function AuthInvalidUser() {
    const [isOpen, setIsModalOpen] = useState(false);
    const [title, setTitle] = useState('Email Verification Failed');
    const [description, setDescription] = useState('');

    const handleModalClose = () => {
        document.dispatchEvent(new CustomEvent('app-loader-status'))
        setIsModalOpen(false);
        setTimeout(()=>{
            setTitle("Email Verification Failed");
            setDescription('');
        },500)
      };

    useEffect(() => {
        function handleInvalidEmail(e) {
            if(e?.detail) {
                if(e.detail === "linked_to_another_user") {
                    setTitle('Email Verification')
                    setDescription('The email you provided is already linked to another account. If this is your email id, then login with the email id and connect this social account in profile settings page. After that you can use any of your linked accounts for subsequent logins.')
                } else if(e.detail === 'unexpected_error') {
                    setTitle('Something went wrong')
                    setDescription('We are unable to authenticate you at the moment due to technical issues. Please try again later')
                } else if (e.detail === 'email-changed') {
                    setTitle('Email Changed recently')
                    setDescription('Your email in our directory has been changed recently. Please login with your updated email id.')
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
    <VerifyEmailModal title={title} description={description} isOpen={isOpen} handleModalClose={handleModalClose}/>
    <style jsx>
        {
            `
            
            
            `
        }
    </style>
    </>
}

export default AuthInvalidUser