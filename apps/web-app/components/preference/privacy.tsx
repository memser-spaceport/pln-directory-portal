import { Switch } from "@protocol-labs-network/ui";
import { APP_ANALYTICS_EVENTS, BTN_LABEL_CONSTANTS, MSG_CONSTANTS, PRIVACY_CONSTANTS, SETTINGS_CONSTANTS, SOMETHING_WENT_WRONG } from "apps/web-app/constants";
import { updatePreference } from "apps/web-app/services/member.service";
import {  useContext, useEffect, useState } from "react";
import Cookies from 'js-cookie';
import { toast } from "react-toastify";
import { SettingsContext } from "apps/web-app/pages/directory/settings";
import { LoadingIndicator } from "../shared/loading-indicator/loading-indicator";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";


interface IPrivacyProps {
    memberPreferences?: any;
    from: string;
}

export default function Privacy({memberPreferences,from}:IPrivacyProps) {

    const analytics = useAppAnalytics();

    const {state, dispatch} = useContext(SettingsContext);

    const [isProcessing, setIsProcessing] = useState<boolean>(false);

    const [disableGitProject, setDisableGitProject] = useState<boolean>(false);
    
    const [memberPreference, setMemberPreference] = useState((memberPreferences) ? memberPreferences : { ...state.preferences });
    const switchEvent = (type,val) => {
        const tempPreference = {
            ...memberPreference,
            [type]:val
        }
        if (type === 'showGithubHandle' && !val) {
            tempPreference.showGithubProjects = val;
            setDisableGitProject(!val);
        } 
        if (type === 'showGithubHandle' && val) {
            setDisableGitProject(!val);
        }
        setMemberPreference(tempPreference);
        dispatch({ type: 'SET_PRIVACY_MODIFIED', payload: true });
    }

    const preferenceSettings = {
        "contact-details": [
            {
                'label': PRIVACY_CONSTANTS.SHOW_EMAIL,
                'defaultValue': memberPreference?.showEmail,
                'event': (evt) => switchEvent('showEmail',evt),
                'helpText': PRIVACY_CONSTANTS.EMAIL_HELP_TXT
            },
            {
                'label': PRIVACY_CONSTANTS.SHOW_GITHUB,
                'defaultValue': memberPreference?.showGithubHandle,
                'event': (evt) => switchEvent('showGithubHandle',evt),
                'helpText': PRIVACY_CONSTANTS.GH_HELP_TXT
            },
            {
                'label': PRIVACY_CONSTANTS.SHOW_TELEGRAM,
                'defaultValue': memberPreference?.showTelegram,
                'event': (evt) => switchEvent('showTelegram',evt),
                'helpText': PRIVACY_CONSTANTS.TELEGRAM_HELP_TXT
            },
            {
                'label': PRIVACY_CONSTANTS.SHOW_LIN_PFL,
                'defaultValue': memberPreference.showLinkedin,
                'event': (evt) => switchEvent('showLinkedin',evt),
                'helpText': PRIVACY_CONSTANTS.LIN_HELP_TXT
            },
            {
                'label': PRIVACY_CONSTANTS.SHOW_DISCORD,
                'defaultValue': memberPreference.showDiscord,
                'event': (evt) => switchEvent('showDiscord',evt),
                'helpText': PRIVACY_CONSTANTS.DISCORD_HLP_TXT
            },
            {
                'label': PRIVACY_CONSTANTS.SHOW_TWITTER,
                'defaultValue': memberPreference.showTwitter,
                'event': (evt) => switchEvent('showTwitter',evt),
                'helpText': PRIVACY_CONSTANTS.TWITTER_HELP_TXT
            }
        ],
        "profile": [
            {
                'label': PRIVACY_CONSTANTS.SHOW_GH_PJCTS,
                'defaultValue': memberPreference.showGithubProjects,
                'event': (evt) => switchEvent('showGithubProjects',evt),
                'helpText': PRIVACY_CONSTANTS.GH_PJCTS_HELP_TXT
            }

        ]
    }

    const getPreferenceTemplate = (settings) => {
        return (
            <div className="flex flex-row py-4 gap-4" key={settings.label}>
                <div className="my-auto">
                    <Switch
                        initialValue={settings.defaultValue}
                        onChange={settings.event}
                        customClassName="pointer-events-none"
                        nonEditable={from === SETTINGS_CONSTANTS.VIEW_PREFERNCES || (disableGitProject && settings.label === PRIVACY_CONSTANTS.SHOW_GH_PJCTS)}
                    />
                </div>
                <div className="flex flex-col">
                    <div className="text-[14px] leading-[20px] font-medium">
                        {settings.label}
                    </div>
                    <div className="text-[13px] leading-[18px] font-medium text-[#0F172A] opacity-40">
                        {settings.helpText}
                    </div>
                </div>
            </div>
        );
    }

    const handleSave = async () => {
        setIsProcessing(true);
        try{
            const response = await updatePreference(JSON.parse(Cookies.get('userInfo')).uid, memberPreference, JSON.parse(Cookies.get('authToken')));
            if(response){
                toast.success(MSG_CONSTANTS.MEMBER_UPDATE_MESSAGE);
                dispatch({ type: 'SET_PRIVACY_MODIFIED', payload: false });
                const prefrenceKeys = Object.keys(state.preferences);
                prefrenceKeys.forEach(key => {
                    if(state.preferences[key] !== response.preferences[key] ) {
                        analytics.captureEvent(
                            APP_ANALYTICS_EVENTS.SETTINGS_USER_PREFERENCES,
                            {
                               name: key,
                               value: response.preferences[key]
                            }
                          );
                    }
                })
                dispatch({type: 'SET_PREFERENCE', payload: {...response.preferences}})
                
            }
        }finally{
            setIsProcessing(false);
        }
        
    }

    const handleReset = () => {
        setDisableGitProject(false);
        dispatch({ type: 'SET_PRIVACY_MODIFIED', payload: false });
        setMemberPreference({ ...state.preferences });
        analytics.captureEvent(
            APP_ANALYTICS_EVENTS.SETTINGS_USER_PREFERENCES_RESET,
            {
               name: 'reset',
               value: true
            }
          );
    }

    return (
        <>
        {isProcessing && (
                <div
                    className={`fixed inset-0 z-[3000] flex items-center justify-center bg-gray-500 bg-opacity-50`}
                >
                    <LoadingIndicator />
                </div>
            )}
            <div className="bg-white rounded-lg mt-5">
                <div className="px-8 py-6">
                    <div className="text-[16px] leading-5 font-bold">
                        {PRIVACY_CONSTANTS.CONTACT_DETAILS}
                    </div>
                    {
                        preferenceSettings && (
                            preferenceSettings['contact-details'].map( contact => {
                                if (contact.label === "Show GitHub" && !contact.defaultValue && !disableGitProject) {
                                  setDisableGitProject(true);
                                }
                                return getPreferenceTemplate(contact);
                            })
                        )
                    }
                </div>
            </div>

            <div className="bg-white rounded-lg mt-5">
            <div className="px-8 py-6">
                    <div className="text-[16px] leading-5 font-bold">
                        {PRIVACY_CONSTANTS.PROFILE}
                    </div>
                    {
                        preferenceSettings && (
                            preferenceSettings['profile'].map( profile => {
                                return getPreferenceTemplate(profile);
                            })
                        )
                    }
                </div>
            </div>

            {(from && from === SETTINGS_CONSTANTS.PRIVACY) && (
                <>
                    <button
                        className={
                            'shadow-special-button-default inline-flex w-[150px] justify-center rounded-full bg-[#156FF7] px-6 py-2 text-base text-[15px] leading-6 text-white outline-none float-right my-6'
                        }
                        onClick={handleSave}
                    >
                        {BTN_LABEL_CONSTANTS.SAVE}
                    </button>
                    <button
                        className={
                            'hadow-special-button-default hover:shadow-on-hover focus:shadow-special-button-focus inline-flex w-[150px] float-right justify-center rounded-full px-6 py-2 m-6 text-base font-semibold leading-6 text-[#156FF7] outline outline-1 outline-[#156FF7] hover:outline-2'
                        }
                        onClick={handleReset}
                    >
                        {BTN_LABEL_CONSTANTS.RESET}
                    </button>
                </>
            )}
            
        </>
    );
}
