import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-black mb-2 tracking-tight">CORPREX</h1>
          <div className="w-20 h-0.5 bg-black mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">Create Your Account</p>
        </div>
        
        <SignUp 
          afterSignUpUrl="/chat"
          appearance={{
            baseTheme: undefined,
            variables: {
              colorPrimary: '#000000',
              colorText: '#000000',
              colorTextSecondary: '#666666',
              colorBackground: '#ffffff',
              colorInputBackground: '#f8f8f8',
              colorInputText: '#000000',
              borderRadius: '0.25rem',
            },
            elements: {
              formButtonPrimary: {
                backgroundColor: '#000000',
                color: '#ffffff',
                borderRadius: '0',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.875rem',
                fontWeight: '500',
                '&:hover': {
                  backgroundColor: '#333333',
                },
              },
              card: {
                backgroundColor: '#ffffff',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e5e5',
                borderRadius: '0',
              },
              headerTitle: {
                color: '#000000',
                fontWeight: '600',
              },
              headerSubtitle: {
                color: '#666666',
              },
              socialButtonsBlockButton: {
                backgroundColor: '#ffffff',
                borderColor: '#e5e5e5',
                color: '#000000',
                '&:hover': {
                  backgroundColor: '#f8f8f8',
                  borderColor: '#000000',
                },
              },
              formFieldLabel: {
                color: '#333333',
                fontSize: '0.875rem',
                fontWeight: '500',
              },
              formFieldInput: {
                backgroundColor: '#f8f8f8',
                borderColor: '#e5e5e5',
                color: '#000000',
                borderRadius: '0',
                '&:focus': {
                  borderColor: '#000000',
                  boxShadow: 'none',
                },
              },
              footerActionLink: {
                color: '#666666',
                '&:hover': {
                  color: '#000000',
                },
              },
              identityPreviewText: {
                color: '#000000',
              },
              identityPreviewEditButton: {
                color: '#666666',
                '&:hover': {
                  color: '#000000',
                },
              },
              dividerLine: {
                backgroundColor: '#e5e5e5',
              },
              dividerText: {
                color: '#999999',
              },
            },
          }}
        />
      </div>
    </div>
  );
}